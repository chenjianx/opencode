import * as fs from "node:fs/promises"
import * as nodePath from "node:path"
import { applyEdits, modify, parse as parseJsonc, type ParseError } from "jsonc-parser/lib/esm/main.js"
import type {
  Agent as OpencodeAgent,
  AgentConfig as OpencodeAgentConfig,
  OpencodeClient,
} from "@opencode-ai/sdk/v2/client"
import type {
  ChatMode,
  ExtensionToWebview,
  RaccoonCommand,
  RaccoonAgentScope,
  RaccoonModel,
  RaccoonPermissionConfig,
  RaccoonProviderAuthMethod,
  RaccoonPluginLanguage,
  RaccoonPluginLanguageMode,
  RaccoonSlashCommand,
  RaccoonState,
  WebviewToExtension,
} from "@opencode-ai/raccoon-webview"
import { uiSlashCommands } from "./commands.js"
import { mapProviderModels, mapProviders, recountProviders } from "../message/mapping.js"
import { ModelStateStore, type ModelSelection, modelKey, modeModelSelections } from "../session/model-state.js"
import { ActionTokenStore } from "../session/action-tokens.js"
import { collectRules } from "./rules-config.js"
import { collectCommands } from "./commands-config.js"
import { isRaccoonLoggedIn, isRaccoonLoginExpired } from "../session/raccoon-auth-state.js"
import type { KeyValueStore, RaccoonWebviewSource, WebviewTransport } from "../platform.js"
import { GLOBAL_CONFIG_FILES, PROJECT_CONFIG_FILES, pickConfigFile } from "./config-paths.js"

type ProviderConfigDeps = {
  client: () => Promise<OpencodeClient>
  directory: () => string
  getState: () => RaccoonState
  setState: (state: RaccoonState) => void
  post: () => void
  refresh: () => Promise<void>
  withLoading: (run: () => Promise<void>) => Promise<void>
  storage?: KeyValueStore
  webviewHost: WebviewTransport
  openExternal: (url: string) => Promise<void>
  promptInput: (options: { title: string; prompt?: string }) => Promise<string | undefined>
  pluginLanguage: () => RaccoonPluginLanguage
}

export class RaccoonProviderConfig {
  private disabledModels = new Set<string>()
  private selectedModel?: ModelSelection
  private modeModels: Partial<Record<ChatMode, ModelSelection>> = {}
  private providerAuthMethods: Record<string, RaccoonProviderAuthMethod[]> = {}
  private pluginLanguageMode: RaccoonPluginLanguageMode
  private readonly raccoonLoginTokens = new ActionTokenStore()
  private readonly providerConnectTokens = new ActionTokenStore()
  private readonly modelState: ModelStateStore

  constructor(private readonly deps: ProviderConfigDeps) {
    this.disabledModels = new Set(deps.storage?.get<string[]>("raccoon.disabledModels", []) ?? [])
    this.modeModels = modeModelSelections(deps.storage?.get("raccoon.modeModels"))
    this.pluginLanguageMode = normalizePluginLanguageMode(deps.storage?.get<string>("raccoon.pluginLanguage"))
    this.modelState = new ModelStateStore(() => this.deps.directory())
  }

  initialState() {
    return {
      selectedModel: this.selectedModel,
      defaultModel: this.selectedModel,
      modeModels: this.modeModels,
      pluginLanguageMode: this.pluginLanguageMode,
      pluginLanguage: this.resolvePluginLanguage(),
    }
  }

  modeModel(mode: ChatMode) {
    return this.modeModels[mode]
  }

  // The persisted default model, resolved against the enabled model list. Unlike
  // `selectModel`, this ignores both the per-mode override and the live `state.selectedModel`
  // (which tracks the active mode in chat) so it stays stable when the user switches modes.
  resolveDefaultModel(models: RaccoonModel[], defaults: Record<string, string>) {
    const enabledModels = models.filter((model) => model.enabled && model.connected)
    const selectedModel = this.selectedModel
    if (selectedModel && enabledModels.some((model) => modelKey(model) === modelKey(selectedModel))) {
      return selectedModel
    }
    // No model has been explicitly configured (no persisted `selectedModel`). When Raccoon is
    // logged in its models are connected, so prefer Raccoon here — its server default, else any
    // Raccoon model. This keeps the default on Raccoon after a silent token refresh / webview
    // reload (which never fires `raccoonLoginFinished`), matching the login behavior. An explicit
    // non-Raccoon choice is preserved by the `selectedModel` branch above.
    const raccoonModels = enabledModels.filter((model) => model.providerID === "raccoon")
    const firstRaccoon = raccoonModels[0]
    if (firstRaccoon) {
      const raccoonDefault = raccoonModels.find((model) => defaults["raccoon"] === model.modelID) ?? firstRaccoon
      return { providerID: raccoonDefault.providerID, modelID: raccoonDefault.modelID }
    }
    const defaultModel = enabledModels.find((model) => defaults[model.providerID] === model.modelID)
    if (defaultModel) return { providerID: defaultModel.providerID, modelID: defaultModel.modelID }
    const firstModel = enabledModels[0]
    if (!firstModel) return undefined
    return { providerID: firstModel.providerID, modelID: firstModel.modelID }
  }

  selectModel(models: RaccoonModel[], defaults: Record<string, string>, mode = this.deps.getState().mode) {
    const enabledModels = models.filter((model) => model.enabled && model.connected)
    const modeModel = this.modeModels[mode]
    if (modeModel && enabledModels.some((model) => modelKey(model) === modelKey(modeModel))) {
      return modeModel
    }
    return this.resolveDefaultModel(models, defaults)
  }

  async loadModels(client?: OpencodeClient) {
    const active = client ?? (await this.deps.client())

    // If the raccoon refresh-token JWT has expired locally, the stored credentials can
    // never be used again. Remove them now so the provider list is rebuilt without stale
    // raccoon auth, and the webview shows the login screen instead of a broken interface.
    if (await isRaccoonLoginExpired()) {
      await this.logoutRaccoon().catch(() => {
        // Best-effort: if removal fails, isRaccoonLoggedIn() below still reads the stale
        // (expired) credential as present, but the next refresh will retry the cleanup.
      })
    }

    const saved = await this.modelState.load(active, { selected: this.selectedModel, model: this.modeModels })
    this.selectedModel = saved.selected
    this.modeModels = saved.model
    const [
      configResponse,
      providerResponse,
      authResponse,
      commandResponse,
      agentResponse,
      rawConfigResponse,
      rawGlobalConfigResponse,
    ] = await Promise.all([
      active.config.providers({ directory: this.deps.directory() }, { throwOnError: true }),
      active.provider.list({ directory: this.deps.directory() }, { throwOnError: true }),
      active.provider.auth({ directory: this.deps.directory() }, { throwOnError: true }),
      active.command.list({ directory: this.deps.directory() }, { throwOnError: true }),
      active.app.agents({ directory: this.deps.directory() }, { throwOnError: true }),
      active.config.get({ directory: this.deps.directory() }, { throwOnError: true }),
      active.global.config.get({ throwOnError: true }).catch(() => undefined),
    ])
    this.providerAuthMethods = authResponse.data ?? {}
    const connected = new Set(providerResponse.data.connected)
    // 暂时隐藏「免费模型」：opencode provider 提供的免费模型不再进入模型列表，
    // 因此对话/设置的模型选择器和默认模型解析都不会再出现它们。恢复时删除此过滤即可。
    const visibleProviders = providerResponse.data.all.filter((provider) => provider.id !== "opencode")
    const models = visibleProviders.flatMap((provider) =>
      mapProviderModels(provider, connected.has(provider.id), this.disabledModels),
    )
    const providers = mapProviders(visibleProviders, connected, models)
    const customProviders = visibleProviders
      .filter((provider) => provider.source === "config" && provider.models && Object.keys(provider.models).length > 0)
      .map((provider) => ({
        providerID: provider.id,
        name: provider.name,
        package: customProviderPackage(Object.values(provider.models)[0]?.api.npm),
        baseURL: typeof provider.options?.baseURL === "string" ? provider.options.baseURL : "",
        headers: customProviderHeaders(provider.options?.headers),
        models: Object.values(provider.models).map((model) => ({
          id: model.id,
          name: model.name,
          supportsImage: model.capabilities.input.image,
        })),
      }))
    const commands = commandResponse.data.map(
      (command): RaccoonCommand => ({
        name: command.name,
        description: command.description,
        source: command.source,
        hints: command.hints,
      }),
    )
    const projectAgentNames = await collectProjectAgentNames(this.deps.directory())
    const agentOverrides = collectAgentOverrides(rawGlobalConfigResponse?.data?.agent, rawConfigResponse.data?.agent)
    const agentScopes = collectAgentScopes(rawGlobalConfigResponse?.data?.agent, projectAgentNames)
    const [projectRules, userRules, projectCommands, userCommands] = await Promise.all([
      collectRules(active, this.deps.directory(), "project").catch(() => []),
      collectRules(active, this.deps.directory(), "user").catch(() => []),
      collectCommands(active, this.deps.directory(), "project").catch(() => []),
      collectCommands(active, this.deps.directory(), "user").catch(() => []),
    ])
    const raccoonLoggedIn = await isRaccoonLoggedIn()
    this.deps.setState({
      ...this.deps.getState(),
      models,
      raccoonLoggedIn,
      defaults: configResponse.data.default,
      agents: visibleAgents(agentResponse.data, agentOverrides, agentScopes),
      rules: [...projectRules, ...userRules],
      commandConfigs: [...projectCommands, ...userCommands],
      providers,
      commands,
      slashCommands: [
        ...uiSlashCommands(),
        ...commands.map(
          (command): RaccoonSlashCommand => ({
            name: command.name,
            description: command.description,
            source: command.source ?? "command",
            mode: "prompt",
          }),
        ),
      ],
      providerAuthMethods: this.providerAuthMethods,
      customProviders,
      selectedModel: this.selectModel(models, configResponse.data.default),
      defaultModel: this.resolveDefaultModel(models, configResponse.data.default),
      modeModels: this.modeModels,
      pluginLanguageMode: this.pluginLanguageMode,
      pluginLanguage: this.resolvePluginLanguage(),
    })
  }

  async setModelEnabled(model: { providerID: string; modelID: string }, enabled: boolean) {
    const key = modelKey(model)
    if (enabled) {
      this.disabledModels.delete(key)
    } else {
      this.disabledModels.add(key)
    }
    await this.deps.storage?.update("raccoon.disabledModels", [...this.disabledModels])
    const models = this.deps.getState().models.map((item) => (modelKey(item) === key ? { ...item, enabled } : item))
    this.deps.setState({
      ...this.deps.getState(),
      models,
      providers: recountProviders(this.deps.getState().providers, models),
      selectedModel: this.selectModel(models, {}, this.deps.getState().mode),
      modeModels: this.modeModels,
      pluginLanguageMode: this.pluginLanguageMode,
      pluginLanguage: this.resolvePluginLanguage(),
    })
    this.deps.post()
  }

  async setProviderEnabled(providerID: string, enabled: boolean) {
    this.deps
      .getState()
      .models.filter((item) => item.providerID === providerID)
      .forEach((model) => {
        const key = modelKey(model)
        if (enabled) {
          this.disabledModels.delete(key)
          return
        }
        this.disabledModels.add(key)
      })
    await this.deps.storage?.update("raccoon.disabledModels", [...this.disabledModels])
    const models = this.deps
      .getState()
      .models.map((model) => (model.providerID === providerID ? { ...model, enabled } : model))
    this.deps.setState({
      ...this.deps.getState(),
      models,
      providers: recountProviders(this.deps.getState().providers, models),
      selectedModel: this.selectModel(models, {}, this.deps.getState().mode),
      pluginLanguageMode: this.pluginLanguageMode,
      pluginLanguage: this.resolvePluginLanguage(),
    })
    this.deps.post()
  }

  async configureProvider(providerID: string, apiKey: string) {
    const client = await this.deps.client()
    const configResponse = await client.config.get({ directory: this.deps.directory() }, { throwOnError: true })
    if (apiKey.trim()) {
      await client.auth.set(
        {
          providerID,
          auth: { type: "api", key: apiKey.trim() },
        },
        { throwOnError: true },
      )
    }
    await client.config.update(
      {
        directory: this.deps.directory(),
        config: {
          disabled_providers: (configResponse.data.disabled_providers ?? []).filter((id) => id !== providerID),
        },
      },
      { throwOnError: true },
    )
    await this.deps.refresh()
  }

  async configureAgent(message: Extract<WebviewToExtension, { type: "configureAgent" }>) {
    const targetName = requireAgentName(message.agent.name ?? message.original?.name ?? "")
    await this.writeAgentConfig(message.scope, targetName, agentConfigValue(message.agent))
    if (message.original && (message.original.name !== targetName || message.original.scope !== message.scope)) {
      await this.writeAgentConfig(message.original.scope, requireAgentName(message.original.name), undefined)
    }
    await this.reloadInstanceConfig()
    await this.deps.refresh()
    return { name: targetName, scope: message.scope }
  }

  async deleteAgent(name: string, scope: RaccoonAgentScope) {
    const agent = requireAgentName(name)
    const deleted = await this.writeAgentConfig(scope, agent, undefined)
    if (!deleted && scope === "project") await this.writeAgentConfig("user", agent, undefined)
    await this.reloadInstanceConfig()
    await this.deps.refresh()
  }

  // opencode resolves config/agents once per instance and caches the result;
  // it only re-reads from disk when the instance is disposed. Writing the
  // config file is therefore not enough for `app.agents()`/`config.get` to
  // reflect the change, so dispose the instance (teardown runs after the HTTP
  // response) to flush those caches before refreshing the webview state.
  private async reloadInstanceConfig() {
    try {
      const client = await this.deps.client()
      await client.instance.dispose({ directory: this.deps.directory() })
    } catch {
      // Best-effort: the config file is already written; a stale view will
      // recover on the next full reload.
    }
  }

  private async writeAgentConfig(scope: RaccoonAgentScope, name: string, value: OpencodeAgentConfig | undefined) {
    if (scope === "user") {
      return await this.writeUserAgentConfig(name, value)
    }
    // Project scope: `client.config.update` persists to `<dir>/config.json`,
    // which opencode never loads as project config (it only reads
    // `opencode.json`/`opencode.jsonc`). Write directly to the loaded file so
    // the change actually takes effect.
    const file = await pickConfigFile(this.deps.directory(), PROJECT_CONFIG_FILES)
    const wrote = await writeAgentToFile(file, name, value)
    const deletedMarkdown =
      value === undefined ? await deleteProjectAgentMarkdownFiles(this.deps.directory(), name) : false
    return wrote || deletedMarkdown
  }

  private async writeUserAgentConfig(name: string, value: OpencodeAgentConfig | undefined) {
    const client = await this.deps.client()
    const pathInfo = await client.path.get({ directory: this.deps.directory() }, { throwOnError: true })
    const configDir = pathInfo.data?.config
    if (!configDir) return
    const file = await pickConfigFile(configDir, GLOBAL_CONFIG_FILES)

    await client.global.config.update(
      {
        config: {
          agent: { [name]: value ?? { disable: true } } as Record<string, OpencodeAgentConfig | undefined>,
        },
      },
      { throwOnError: true },
    )

    // `global.config.update` is merge-only: it cannot remove keys and can leave
    // stale fields in the cached global config. Rewrite the real file to the
    // exact target state, then dispose globally so the next refresh reloads that
    // final state instead of an SDK merge intermediate.
    const wrote = await writeAgentToFile(file, name, value)
    const deletedMarkdown = value === undefined ? await deleteAgentMarkdownFiles(configDir, name) : false
    await client.global.dispose({ throwOnError: true })
    return wrote || deletedMarkdown
  }

  async connectProvider(message: Extract<WebviewToExtension, { type: "connectProvider" }>) {
    const token = this.providerConnectTokens.issue(message.providerID)
    const cancelled = () => !this.providerConnectTokens.isCurrent(message.providerID, token)
    try {
      const client = await this.deps.client()
      if (cancelled()) return
      const configResponse = await client.config.get({ directory: this.deps.directory() }, { throwOnError: true })
      if (cancelled()) return
      const authMethods = this.providerAuthMethods[message.providerID] ?? [{ type: "api", label: "API key" }]
      const methodIndex = message.methodIndex ?? 0
      const method = authMethods[methodIndex]
      if (!method) throw new Error("Provider auth method not found")
      if (method.type === "oauth") {
        const authorization = await client.provider.oauth.authorize(
          {
            providerID: message.providerID,
            directory: this.deps.directory(),
            method: methodIndex,
            inputs: message.inputs,
          },
          { throwOnError: true },
        )
        if (cancelled()) return
        if (!authorization.data) throw new Error("Provider did not return an authorization URL")
        if (authorization.data.method === "code") {
          const code = await this.deps.promptInput({
            title: `${method.label} authorization code`,
            prompt: authorization.data.instructions,
          })
          if (cancelled()) return
          if (!code) throw new Error("Provider login cancelled")
          await client.provider.oauth.callback(
            {
              providerID: message.providerID,
              directory: this.deps.directory(),
              method: methodIndex,
              code,
            },
            { throwOnError: true },
          )
        } else {
          void this.deps.openExternal(authorization.data.url)
          await client.provider.oauth.callback(
            {
              providerID: message.providerID,
              directory: this.deps.directory(),
              method: methodIndex,
            },
            { throwOnError: true },
          )
        }
        if (cancelled()) return
      }
      if (method.type === "api" && message.apiKey?.trim()) {
        await client.auth.set(
          {
            providerID: message.providerID,
            auth: {
              type: "api",
              key: message.apiKey.trim(),
              ...(message.inputs && Object.keys(message.inputs).length > 0 ? { metadata: message.inputs } : {}),
            },
          },
          { throwOnError: true },
        )
        if (cancelled()) return
      }
      await client.config.update(
        {
          directory: this.deps.directory(),
          config: {
            disabled_providers: (configResponse.data.disabled_providers ?? []).filter(
              (id) => id !== message.providerID,
            ),
          },
        },
        { throwOnError: true },
      )
      if (cancelled()) return
      await this.deps.refresh()
      if (cancelled()) return
      this.deps.webviewHost.post("settings", {
        type: "providerConnectFinished",
        providerID: message.providerID,
      } satisfies ExtensionToWebview)
    } catch (error) {
      if (cancelled()) return
      this.deps.webviewHost.post("settings", {
        type: "providerConnectFinished",
        providerID: message.providerID,
        error: error instanceof Error ? error.message : String(error),
      } satisfies ExtensionToWebview)
    }
  }

  cancelProviderConnect(providerID?: string) {
    const providerIDs = providerID ? [providerID] : this.providerConnectTokens.keys()
    providerIDs.forEach((id) => this.providerConnectTokens.cancel(id))
    this.deps.setState({ ...this.deps.getState(), loading: false, busy: false })
    this.deps.post()
    providerIDs.forEach((id) => {
      this.deps.webviewHost.post("settings", {
        type: "providerConnectFinished",
        providerID: id,
      } satisfies ExtensionToWebview)
    })
  }

  // Disconnect a standard (API key / OAuth) provider: drop its stored
  // credentials and add it to `disabled_providers` so it disappears from the
  // list even when an env credential is present. Mirrors `logoutRaccoon`: the
  // provider list is cached in the server instance, so dispose it before
  // refreshing. Reuses the `providerConnectFinished` message so the webview can
  // clear its loading state (and surface any error).
  async disconnectProvider(providerID: string) {
    try {
      const client = await this.deps.client()
      const configResponse = await client.config.get({ directory: this.deps.directory() }, { throwOnError: true })
      await client.auth.remove({ providerID }, { throwOnError: true })
      await client.config.update(
        {
          directory: this.deps.directory(),
          config: {
            disabled_providers: [
              ...(configResponse.data.disabled_providers ?? []).filter((id) => id !== providerID),
              providerID,
            ],
          },
        },
        { throwOnError: true },
      )
      await client.instance.dispose({ directory: this.deps.directory() }, { throwOnError: true })
      await this.deps.refresh()
      this.deps.webviewHost.post("settings", {
        type: "providerConnectFinished",
        providerID,
      } satisfies ExtensionToWebview)
    } catch (error) {
      this.deps.webviewHost.post("settings", {
        type: "providerConnectFinished",
        providerID,
        error: error instanceof Error ? error.message : String(error),
      } satisfies ExtensionToWebview)
    }
  }

  async loginRaccoon(serverUrl: string | undefined, source: RaccoonWebviewSource) {
    const token = this.raccoonLoginTokens.issue()
    await this.deps
      .withLoading(async () => {
        const client = await this.deps.client()
        const methodsResponse = await client.provider.auth({ directory: this.deps.directory() }, { throwOnError: true })
        const index = methodsResponse.data.raccoon?.findIndex((method) => method.type === "oauth") ?? -1
        if (index < 0) throw new Error("Raccoon login is not available. Check that the Raccoon auth plugin is loaded.")
        if (!this.raccoonLoginTokens.isCurrent(undefined, token)) return

        const authorization = await client.provider.oauth.authorize(
          {
            providerID: "raccoon",
            directory: this.deps.directory(),
            method: index,
            inputs: serverUrl ? { serverUrl } : undefined,
          },
          { throwOnError: true },
        )
        if (!this.raccoonLoginTokens.isCurrent(undefined, token)) return
        if (!authorization.data) throw new Error("Raccoon did not return an authorization URL")

        if (authorization.data.method === "code") {
          const code = await this.deps.promptInput({
            title: "Raccoon authorization code",
            prompt: authorization.data.instructions,
          })
          if (!this.raccoonLoginTokens.isCurrent(undefined, token)) return
          if (!code) throw new Error("Raccoon login cancelled")
          await client.provider.oauth.callback(
            {
              providerID: "raccoon",
              directory: this.deps.directory(),
              method: index,
              code,
            },
            { throwOnError: true },
          )
        } else {
          await client.provider.oauth.callback(
            {
              providerID: "raccoon",
              directory: this.deps.directory(),
              method: index,
            },
            { throwOnError: true },
          )
        }
        if (!this.raccoonLoginTokens.isCurrent(undefined, token)) return

        // auth.set during the callback only rewrites auth.json; the cached provider
        // list still reflects the pre-login state. Dispose the instance so the refresh
        // below rebuilds it with the new credentials and reports raccoon as connected.
        await client.instance.dispose({ directory: this.deps.directory() }, { throwOnError: true })
        await this.deps.refresh()
        if (!this.raccoonLoginTokens.isCurrent(undefined, token)) return
        this.deps.webviewHost.post(source, { type: "raccoonLoginFinished" } satisfies ExtensionToWebview)
      })
      .catch((error) => {
        if (!this.raccoonLoginTokens.isCurrent(undefined, token)) return
        this.deps.webviewHost.post(source, {
          type: "raccoonLoginFinished",
          error: error instanceof Error ? error.message : String(error),
        } satisfies ExtensionToWebview)
        throw error
      })
  }

  cancelRaccoonLogin() {
    this.raccoonLoginTokens.cancel()
    this.deps.setState({ ...this.deps.getState(), loading: false, busy: false })
    this.deps.post()
    this.deps.webviewHost.postRaccoonLoginFinished()
  }

  async logoutRaccoon() {
    const client = await this.deps.client()
    await client.auth.remove({ providerID: "raccoon" }, { throwOnError: true })
    // Removing credentials only rewrites auth.json; the provider list (and its
    // `connected` set) is cached in the server instance state and won't change until
    // the instance is rebuilt. Dispose it so the next refresh reports raccoon as
    // disconnected. The instance is lazily recreated on the following request.
    await client.instance.dispose({ directory: this.deps.directory() }, { throwOnError: true })
  }

  private async globalConfigFile() {
    const client = await this.deps.client()
    const pathInfo = await client.path.get({ directory: this.deps.directory() }, { throwOnError: true })
    const configDir = pathInfo.data?.config
    if (!configDir) throw new Error("Unable to resolve the global opencode config directory")
    return pickConfigFile(configDir, GLOBAL_CONFIG_FILES)
  }

  async configureCustomProvider(message: Extract<WebviewToExtension, { type: "configureCustomProvider" }>) {
    const providerID = message.providerID.trim()
    const name = message.name.trim()
    const baseURL = message.baseURL.trim()
    const headers = cleanHeaders(message.headers)
    const models = message.models
      .map((model) => ({ id: model.id.trim(), name: model.name.trim(), supportsImage: model.supportsImage ?? false }))
      .filter((model) => model.id && model.name)
    if (!providerID || !name || !baseURL || models.length === 0) throw new Error("Custom provider fields are required")
    if (!/^https?:\/\//.test(baseURL)) throw new Error("Custom provider base URL must start with http:// or https://")
    const client = await this.deps.client()
    const configResponse = await client.global.config.get({ throwOnError: true })
    if (message.apiKey.trim()) {
      await client.auth.set(
        {
          providerID,
          auth: { type: "api", key: message.apiKey.trim() },
        },
        { throwOnError: true },
      )
    }
    const providerValue = {
      api: baseURL,
      npm: message.package,
      name,
      options: {
        baseURL,
        ...(headers ? { headers } : {}),
      },
      models: Object.fromEntries(
        models.map((model) => [
          model.id,
          {
            name: model.name,
            ...(model.supportsImage
              ? {
                  modalities: {
                    input: ["text", "image"] as Array<"text" | "image">,
                    output: ["text"] as Array<"text">,
                  },
                }
              : {}),
          },
        ]),
      ),
    }
    // Order matters. opencode merges the global config from several files into
    // an infinite-TTL cache that only invalidates when `global.config.update`
    // writes a real change, and that update is merge-only (it cannot drop a
    // removed model — it would merge the stale entry back in).
    //   1. Remove the provider from the file first, so no stale models survive.
    //   2. Re-add the exact target via the SDK update: merging into the now-empty
    //      slot writes precisely `providerValue` AND forces cache invalidation.
    const file = await this.globalConfigFile()
    await writeProviderToFile(file, providerID, undefined)
    await client.global.config.update(
      {
        config: {
          disabled_providers: (configResponse.data.disabled_providers ?? []).filter((id) => id !== providerID),
          provider: { [providerID]: providerValue },
        },
      },
      { throwOnError: true },
    )
    // Dispose so the next refresh reloads the rewritten file (global dispose
    // also tears down the per-instance config the provider list is built from).
    await client.global.dispose({ throwOnError: true })
    await this.reloadInstanceConfig()
    models.forEach((model) => this.disabledModels.delete(modelKey({ providerID, modelID: model.id })))
    await this.deps.storage?.update("raccoon.disabledModels", [...this.disabledModels])
    await this.deps.refresh()
    this.deps.webviewHost.postCustomProviderSaved(providerID)
  }

  async deleteCustomProvider(providerID: string) {
    const id = providerID.trim()
    if (!id) throw new Error("Custom provider ID is required")
    const client = await this.deps.client()
    const configResponse = await client.global.config.get({ throwOnError: true })
    // Remove the provider from the file first (the authoritative delete — the
    // merge-only SDK update cannot remove a key). Then force the infinite-TTL
    // global config cache to invalidate by adding the id to `disabled_providers`,
    // which is a real change. Crucially, a disabled provider is hidden from the
    // list, so even if the cache briefly races on stale content the provider
    // never reappears (a renamed-provider sentinel would show up instead). The
    // stale id left in `disabled_providers` is harmless and is filtered out again
    // if the same provider is recreated.
    await writeProviderToFile(await this.globalConfigFile(), id, undefined)
    await client.global.config.update(
      {
        config: {
          disabled_providers: [...(configResponse.data.disabled_providers ?? []).filter((item) => item !== id), id],
        },
      },
      { throwOnError: true },
    )
    await client.global.dispose({ throwOnError: true })
    await this.reloadInstanceConfig()
    this.disabledModels = new Set([...this.disabledModels].filter((key) => !key.startsWith(`${id}/`)))
    await this.deps.storage?.update("raccoon.disabledModels", [...this.disabledModels])
    await this.deps.refresh()
    this.deps.webviewHost.postCustomProviderSaved(id)
  }

  async setModeModel(mode: ChatMode, model?: ModelSelection) {
    if (model) {
      this.modeModels = { ...this.modeModels, [mode]: model }
    } else {
      const next = { ...this.modeModels }
      delete next[mode]
      this.modeModels = next
    }
    await this.modelState.write(await this.deps.client(), { selected: this.selectedModel, model: this.modeModels })
    await this.deps.storage?.update("raccoon.modeModels", undefined)
    this.deps.setState({
      ...this.deps.getState(),
      modeModels: this.modeModels,
      selectedModel: model && mode === this.deps.getState().mode ? model : this.deps.getState().selectedModel,
      pluginLanguageMode: this.pluginLanguageMode,
      pluginLanguage: this.resolvePluginLanguage(),
    })
    this.deps.post()
  }

  setMode(mode: ChatMode) {
    this.deps.setState({
      ...this.deps.getState(),
      mode,
      selectedModel: this.selectModel(this.deps.getState().models, this.deps.getState().defaults ?? {}, mode),
      pluginLanguageMode: this.pluginLanguageMode,
      pluginLanguage: this.resolvePluginLanguage(),
    })
    this.deps.post()
  }

  async setModel(model: ModelSelection | undefined) {
    this.selectedModel = model
    await this.modelState.write(await this.deps.client(), { selected: this.selectedModel, model: this.modeModels })
    this.deps.setState({
      ...this.deps.getState(),
      selectedModel: model,
      defaultModel: model,
      modeModels: this.modeModels,
      pluginLanguageMode: this.pluginLanguageMode,
      pluginLanguage: this.resolvePluginLanguage(),
    })
    this.deps.post()
  }

  async setPluginLanguage(language: RaccoonPluginLanguageMode) {
    this.pluginLanguageMode = language
    await this.deps.storage?.update("raccoon.pluginLanguage", language === "auto" ? undefined : language)
    this.deps.setState({
      ...this.deps.getState(),
      pluginLanguageMode: language,
      pluginLanguage: this.resolvePluginLanguage(),
    })
    this.deps.post()
  }

  private resolvePluginLanguage() {
    if (this.pluginLanguageMode === "auto") return this.deps.pluginLanguage()
    return this.pluginLanguageMode
  }
}

function normalizePluginLanguageMode(value: string | undefined): RaccoonPluginLanguageMode {
  if (value === "auto" || value === "en" || value === "zh-Hans" || value === "zh-Hant") return value
  return "auto"
}

function customProviderHeaders(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return cleanHeaders(value as Record<string, unknown>)
}

function customProviderPackage(value: unknown): "@ai-sdk/openai" | "@ai-sdk/anthropic" | "@ai-sdk/openai-compatible" {
  if (value === "@ai-sdk/openai" || value === "@ai-sdk/anthropic" || value === "@ai-sdk/openai-compatible") return value
  return "@ai-sdk/openai-compatible" as const
}

function cleanHeaders(value: Record<string, unknown> | undefined) {
  const headers = Object.fromEntries(
    Object.entries(value ?? {})
      .map(([key, headerValue]) => [key.trim(), typeof headerValue === "string" ? headerValue.trim() : ""] as const)
      .filter(([key, headerValue]) => key && headerValue),
  )
  if (Object.keys(headers).length === 0) return undefined
  return headers
}

function collectAgentOverrides(
  ...sources: (Record<string, OpencodeAgentConfig | undefined> | undefined)[]
): Record<string, RaccoonPermissionConfig> {
  const overrides: Record<string, RaccoonPermissionConfig> = {}
  for (const source of sources) {
    if (!source) continue
    for (const [name, config] of Object.entries(source)) {
      if (config?.permission) overrides[name] = config.permission as RaccoonPermissionConfig
    }
  }
  return overrides
}

// Set, replace, or (when value is undefined) delete `agent[name]` in a JSON
// config file. We read/modify/write the JSON ourselves (rather than via the
// merge-only SDK) so we can clear stale keys and actually remove an agent.
// A parse error on existing content is surfaced instead of clobbering the file.
async function writeAgentToFile(file: string, name: string, value: OpencodeAgentConfig | undefined) {
  let raw: string | undefined
  try {
    raw = await fs.readFile(file, "utf8")
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
  }
  if (value === undefined && !raw) return false
  const source = raw?.trim() ? raw : "{}"
  const config = parseConfig(source, file)
  const current = config.agent
  const exists =
    current && typeof current === "object" && !Array.isArray(current)
      ? Object.hasOwn(current as Record<string, unknown>, name)
      : false
  if (value === undefined && !exists) return false
  const updated = applyEdits(
    source,
    modify(source, ["agent", name], value, {
      formattingOptions: {
        insertSpaces: true,
        tabSize: 2,
      },
    }),
  )
  await fs.mkdir(nodePath.dirname(file), { recursive: true })
  await fs.writeFile(file, updated.endsWith("\n") ? updated : `${updated}\n`)
  return true
}

// Set, replace, or (when value is undefined) delete `provider[id]` in a JSON
// config file. We read/modify/write the JSON ourselves (rather than via the
// merge-only SDK) so removing a provider actually drops the key and removing a
// model from a provider clears the stale model entry instead of merging it back.
// A parse error on existing content is surfaced instead of clobbering the file.
async function writeProviderToFile(file: string, id: string, value: unknown | undefined) {
  let raw: string | undefined
  try {
    raw = await fs.readFile(file, "utf8")
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
  }
  if (value === undefined && !raw) return false
  const source = raw?.trim() ? raw : "{}"
  const config = parseConfig(source, file)
  const current = config.provider
  const exists =
    current && typeof current === "object" && !Array.isArray(current)
      ? Object.hasOwn(current as Record<string, unknown>, id)
      : false
  if (value === undefined && !exists) return false
  const updated = applyEdits(
    source,
    modify(source, ["provider", id], value, {
      formattingOptions: {
        insertSpaces: true,
        tabSize: 2,
      },
    }),
  )
  await fs.mkdir(nodePath.dirname(file), { recursive: true })
  await fs.writeFile(file, updated.endsWith("\n") ? updated : `${updated}\n`)
  return true
}

async function deleteAgentMarkdownFiles(dir: string, name: string) {
  const deleted = await Promise.all(
    ["agent", "agents"].map((folder) =>
      fs.unlink(nodePath.join(dir, folder, `${name}.md`)).then(
        () => true,
        (err) => {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
          return false
        },
      ),
    ),
  )
  return deleted.some(Boolean)
}

// Project agent markdown may live under either the raccoon or the legacy opencode
// config dir; delete from both so a removed agent leaves nothing behind.
async function deleteProjectAgentMarkdownFiles(directory: string, name: string) {
  const results = await Promise.all(
    [".raccoon", ".opencode"].map((dir) => deleteAgentMarkdownFiles(nodePath.join(directory, dir), name)),
  )
  return results.some(Boolean)
}

function parseConfig(raw: string, file: string) {
  const errors: ParseError[] = []
  const parsed = parseJsonc(raw, errors, { allowTrailingComma: true })
  if (errors.length > 0) {
    throw new Error(`Failed to parse config file ${file}`)
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>
  }
  return {}
}

async function collectProjectAgentNames(directory: string) {
  const names = new Set<string>()
  for (const dir of [directory, nodePath.join(directory, ".raccoon"), nodePath.join(directory, ".opencode")]) {
    const file = await pickConfigFile(dir, PROJECT_CONFIG_FILES)
    const config = await readConfigFile(file)
    for (const name of Object.keys(config.agent ?? {})) names.add(name)
  }
  for (const dir of [".raccoon", ".opencode"]) {
    for (const name of await collectAgentMarkdownNames(nodePath.join(directory, dir))) names.add(name)
  }
  return names
}

async function readConfigFile(file: string) {
  try {
    return parseConfig(await fs.readFile(file, "utf8"), file) as { agent?: Record<string, unknown> }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw err
  }
}

async function collectAgentMarkdownNames(dir: string) {
  const names = await Promise.all(
    ["agent", "agents"].map((folder) =>
      fs.readdir(nodePath.join(dir, folder), { withFileTypes: true }).then(
        (entries) =>
          entries
            .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
            .map((entry) => entry.name.slice(0, -3)),
        (err) => {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
          return []
        },
      ),
    ),
  )
  return names.flat()
}

function collectAgentScopes(
  global: Record<string, OpencodeAgentConfig | undefined> | undefined,
  project: Set<string>,
): Record<string, RaccoonAgentScope> {
  const scopes: Record<string, RaccoonAgentScope> = {}
  for (const name of Object.keys(global ?? {})) scopes[name] = "user"
  // Project entries win: that is the closest override and where edits land.
  for (const name of project) scopes[name] = "project"
  return scopes
}

function visibleAgents(
  agents: OpencodeAgent[],
  overrides: Record<string, RaccoonPermissionConfig> = {},
  scopes: Record<string, RaccoonAgentScope> = {},
) {
  return agents.map((agent) => ({
    name: agent.name,
    description: agent.description,
    mode: agent.mode,
    native: agent.native,
    hidden: agent.hidden,
    temperature: agent.temperature,
    topP: agent.topP,
    variant: agent.variant,
    steps: agent.steps,
    color: agent.color,
    permission: agent.permission,
    permissionConfig: overrides[agent.name],
    configScope: scopes[agent.name],
    model: agent.model,
    prompt: agent.prompt,
    options: agent.options,
  }))
}

export type RaccoonAgentConfigUpdate = {
  name?: string
  description?: string
  mode?: "subagent" | "primary" | "all"
  model?: ModelSelection
  temperature?: number
  topP?: number
  variant?: string
  steps?: number
  prompt?: string
  permission?: RaccoonPermissionConfig
  hidden?: boolean
  disable?: boolean
}

function requireAgentName(value: string) {
  const name = value.trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name))
    throw new Error("Agent name must use letters, numbers, dashes, or underscores")
  return name
}

function agentConfigValue(agent: RaccoonAgentConfigUpdate): OpencodeAgentConfig {
  return {
    ...(agent.model ? { model: `${agent.model.providerID}/${agent.model.modelID}` } : {}),
    ...(agent.description !== undefined ? { description: agent.description.trim() } : {}),
    ...(agent.mode ? { mode: agent.mode } : {}),
    ...(agent.temperature !== undefined ? { temperature: agent.temperature } : {}),
    ...(agent.topP !== undefined ? { top_p: agent.topP } : {}),
    ...(agent.variant !== undefined ? { variant: agent.variant.trim() } : {}),
    ...(agent.steps !== undefined ? { steps: agent.steps } : {}),
    ...(agent.prompt !== undefined ? { prompt: agent.prompt } : {}),
    ...(agent.permission ? { permission: agent.permission } : {}),
    ...(agent.hidden !== undefined ? { hidden: agent.hidden } : {}),
    ...(agent.disable !== undefined ? { disable: agent.disable } : {}),
  }
}
