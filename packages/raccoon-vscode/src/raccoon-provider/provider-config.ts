import * as vscode from "vscode"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import type {
  ChatMode,
  ExtensionToWebview,
  RaccoonCommand,
  RaccoonModel,
  RaccoonProviderAuthMethod,
  RaccoonSlashCommand,
  RaccoonState,
  WebviewToExtension,
} from "@opencode-ai/raccoon-webview"
import { uiSlashCommands } from "./commands.js"
import { mapProviderModels, mapProviders, recountProviders } from "./mapping.js"
import { ModelStateStore, type ModelSelection, modelKey, modeModelSelections } from "./model-state.js"
import { ActionTokenStore } from "./action-tokens.js"
import type { RaccoonWebviewHost, RaccoonWebviewSource } from "./webview-host.js"

type ProviderConfigDeps = {
  client: () => Promise<OpencodeClient>
  directory: () => string
  getState: () => RaccoonState
  setState: (state: RaccoonState) => void
  post: () => void
  refresh: () => Promise<void>
  withLoading: (run: () => Promise<void>) => Promise<void>
  storage?: vscode.Memento
  webviewHost: RaccoonWebviewHost
}

export class RaccoonProviderConfig {
  private disabledModels = new Set<string>()
  private selectedModel?: ModelSelection
  private modeModels: Partial<Record<ChatMode, ModelSelection>> = {}
  private providerAuthMethods: Record<string, RaccoonProviderAuthMethod[]> = {}
  private readonly raccoonLoginTokens = new ActionTokenStore()
  private readonly providerConnectTokens = new ActionTokenStore()
  private readonly modelState: ModelStateStore

  constructor(private readonly deps: ProviderConfigDeps) {
    this.disabledModels = new Set(deps.storage?.get<string[]>("raccoon.disabledModels", []) ?? [])
    this.modeModels = modeModelSelections(deps.storage?.get("raccoon.modeModels"))
    this.modelState = new ModelStateStore(() => this.deps.directory())
  }

  initialState() {
    return { selectedModel: this.selectedModel, modeModels: this.modeModels }
  }

  modeModel(mode: ChatMode) {
    return this.modeModels[mode]
  }

  selectModel(models: RaccoonModel[], defaults: Record<string, string>, mode = this.deps.getState().mode) {
    const enabledModels = models.filter((model) => model.enabled && model.connected)
    const modeModel = this.modeModels[mode]
    if (modeModel && enabledModels.some((model) => modelKey(model) === modelKey(modeModel))) {
      return modeModel
    }
    const selectedModel = this.deps.getState().selectedModel ?? this.selectedModel
    if (selectedModel && enabledModels.some((model) => modelKey(model) === modelKey(selectedModel))) {
      return selectedModel
    }
    const defaultModel = enabledModels.find((model) => defaults[model.providerID] === model.modelID)
    if (defaultModel) return { providerID: defaultModel.providerID, modelID: defaultModel.modelID }
    const firstModel = enabledModels[0]
    if (!firstModel) return undefined
    return { providerID: firstModel.providerID, modelID: firstModel.modelID }
  }

  async loadModels(client?: OpencodeClient) {
    const active = client ?? (await this.deps.client())
    const saved = await this.modelState.load(active, { selected: this.selectedModel, model: this.modeModels })
    this.selectedModel = saved.selected
    this.modeModels = saved.model
    const [configResponse, providerResponse, authResponse, commandResponse] = await Promise.all([
      active.config.providers({ directory: this.deps.directory() }, { throwOnError: true }),
      active.provider.list({ directory: this.deps.directory() }, { throwOnError: true }),
      active.provider.auth({ directory: this.deps.directory() }, { throwOnError: true }),
      active.command.list({ directory: this.deps.directory() }, { throwOnError: true }),
    ])
    this.providerAuthMethods = authResponse.data ?? {}
    const connected = new Set(providerResponse.data.connected)
    const models = providerResponse.data.all.flatMap((provider) => mapProviderModels(provider, connected.has(provider.id), this.disabledModels))
    const providers = mapProviders(providerResponse.data.all, connected, models)
    const customProviders = providerResponse.data.all
      .filter((provider) => provider.source === "config" && provider.models && Object.keys(provider.models).length > 0)
      .map((provider) => ({
        providerID: provider.id,
        name: provider.name,
        baseURL: typeof provider.options?.baseURL === "string" ? provider.options.baseURL : "",
        models: Object.values(provider.models).map((model) => ({
          id: model.id,
          name: model.name,
        })),
      }))
    const commands = commandResponse.data.map((command): RaccoonCommand => ({
      name: command.name,
      description: command.description,
      source: command.source,
      hints: command.hints,
    }))
    this.deps.setState({
      ...this.deps.getState(),
      models,
      providers,
      commands,
      slashCommands: [
        ...uiSlashCommands(),
        ...commands.map((command): RaccoonSlashCommand => ({
          name: command.name,
          description: command.description,
          source: command.source ?? "command",
          mode: "prompt",
        })),
      ],
      providerAuthMethods: this.providerAuthMethods,
      customProviders,
      selectedModel: this.selectModel(models, configResponse.data.default),
      modeModels: this.modeModels,
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
    const models = this.deps.getState().models.map((model) => (model.providerID === providerID ? { ...model, enabled } : model))
    this.deps.setState({
      ...this.deps.getState(),
      models,
      providers: recountProviders(this.deps.getState().providers, models),
      selectedModel: this.selectModel(models, {}, this.deps.getState().mode),
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
          const code = await vscode.window.showInputBox({
            title: `${method.label} authorization code`,
            prompt: authorization.data.instructions,
            ignoreFocusOut: true,
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
          void vscode.env.openExternal(vscode.Uri.parse(authorization.data.url))
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
            disabled_providers: (configResponse.data.disabled_providers ?? []).filter((id) => id !== message.providerID),
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
          const code = await vscode.window.showInputBox({
            title: "Raccoon authorization code",
            prompt: authorization.data.instructions,
            ignoreFocusOut: true,
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

  async configureCustomProvider(message: Extract<WebviewToExtension, { type: "configureCustomProvider" }>) {
    const providerID = message.providerID.trim()
    const name = message.name.trim()
    const baseURL = message.baseURL.trim()
    const models = message.models.map((model) => ({ id: model.id.trim(), name: model.name.trim() })).filter((model) => model.id && model.name)
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
    await client.global.config.update(
      {
        config: {
          disabled_providers: (configResponse.data.disabled_providers ?? []).filter((id) => id !== providerID),
          provider: {
            [providerID]: {
              api: baseURL,
              npm: "@ai-sdk/openai-compatible",
              name,
              options: { baseURL },
              models: Object.fromEntries(models.map((model) => [model.id, { name: model.name }])),
            },
          },
        },
      },
      { throwOnError: true },
    )
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
    await client.global.config.update(
      {
        config: {
          disabled_providers: (configResponse.data.disabled_providers ?? []).filter((item) => item !== id),
          provider: { [id]: undefined } as Record<string, never>,
        },
      },
      { throwOnError: true },
    )
    this.disabledModels = new Set([...this.disabledModels].filter((key) => !key.startsWith(`${id}/`)))
    await this.deps.storage?.update("raccoon.disabledModels", [...this.disabledModels])
    await this.deps.refresh()
    this.deps.webviewHost.postCustomProviderSaved(id)
  }

  async setModeModel(mode: ChatMode, model?: ModelSelection) {
    this.modeModels = { ...this.modeModels }
    if (model) this.modeModels[mode] = model
    else delete this.modeModels[mode]
    await this.modelState.write(await this.deps.client(), { selected: this.selectedModel, model: this.modeModels })
    await this.deps.storage?.update("raccoon.modeModels", undefined)
    this.deps.setState({
      ...this.deps.getState(),
      modeModels: this.modeModels,
      selectedModel: mode === this.deps.getState().mode ? model : this.deps.getState().selectedModel,
    })
    this.deps.post()
  }

  setMode(mode: ChatMode) {
    this.deps.setState({ ...this.deps.getState(), mode, selectedModel: this.selectModel(this.deps.getState().models, {}, mode) })
    this.deps.post()
  }

  async setModel(model: ModelSelection | undefined) {
    this.selectedModel = model
    await this.modelState.write(await this.deps.client(), { selected: this.selectedModel, model: this.modeModels })
    this.deps.setState({ ...this.deps.getState(), selectedModel: model, modeModels: this.modeModels })
    this.deps.post()
  }
}
