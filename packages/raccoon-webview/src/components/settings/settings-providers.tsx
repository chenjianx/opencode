import { useEffect, useMemo, useState } from "react"
import { useLanguage } from "../../context/language"
import { useSessionActions, useSessionConfig } from "../../context/session"
import { useVSCode } from "../../context/vscode"
import type { CustomProviderPackage, RaccoonProviderAuthMethod } from "../../protocol"
import { RACCOON_LOGIN_URL } from "../../config"
import { SettingsCustomProviderDialog } from "./settings-custom-provider-dialog"
import { SettingsDialog } from "./settings-dialog"
import { SettingsProviderConnectDialog } from "./settings-provider-connect-dialog"
import { ProviderIcon } from "./provider-icons"
import { Button } from "../ui"
import { TextField } from "./settings-common"
import { visiblePrompt } from "./utils"

const popularProviders = [
  { id: "openai", name: "OpenAI", noteKey: "settings.providers.openai.note" },
  { id: "anthropic", name: "Anthropic", noteKey: "settings.providers.anthropic.note" },
  { id: "google", name: "Google", noteKey: "settings.providers.google.note" },
  { id: "openrouter", name: "OpenRouter", noteKey: "settings.providers.openrouter.note" },
  { id: "copilot", name: "GitHub Copilot", noteKey: "settings.providers.copilot.note" },
] as const

// 展示国外供应商的「热门供应商」发现入口。
// 隐藏时将此开关改回 true 即可只保留自定义添加入口。
const HIDE_FOREIGN_PROVIDERS = true

// raccoon (login) and opencode (free models) get their own pinned cards at the
// top, so they are excluded from the dynamic connected/popular sections.
const builtinProviderIDs = new Set(["raccoon", "opencode"])

const emptyCustomModel = () => ({ id: "", name: "", supportsImage: false })
const emptyCustomHeader = () => ({ key: "", value: "" })

type ProviderDraft = {
  methodIndex: number
  apiKey: string
  inputs: Record<string, string>
}

type CustomModelDraft = {
  id: string
  name: string
  supportsImage?: boolean
}

type CustomHeaderDraft = {
  key: string
  value: string
}

type CustomHeadersResult =
  | { ok: true; headers?: Record<string, string> }
  | { ok: false; key: string }

function customHeaders(headers: CustomHeaderDraft[]): CustomHeadersResult {
  const entries = headers
    .map((header) => ({ key: header.key.trim(), value: header.value.trim() }))
    .filter((header) => header.key || header.value)
  const invalid = entries.find((header) => !header.key || !header.value)
  if (invalid) return { ok: false, key: invalid.key || invalid.value }
  const result = Object.fromEntries(entries.map((header) => [header.key, header.value]))
  if (Object.keys(result).length === 0) return { ok: true }
  return { ok: true, headers: result }
}

function customHeaderDrafts(headers: Record<string, string> | undefined) {
  const entries = Object.entries(headers ?? {})
  if (entries.length === 0) return [emptyCustomHeader()]
  return entries.map(([key, value]) => ({ key, value }))
}

export function SettingsProviders() {
  const language = useLanguage()
  const config = useSessionConfig()
  const actions = useSessionActions()
  const vscode = useVSCode()
  const apiKeyMethod: RaccoonProviderAuthMethod = { type: "api", label: language.t("settings.providers.connect.apiKey") }
  const [activeProvider, setActiveProvider] = useState<string>()
  const [raccoonDialogOpen, setRaccoonDialogOpen] = useState(false)
  const [raccoonServerUrl, setRaccoonServerUrl] = useState(RACCOON_LOGIN_URL)
  const [raccoonLoggingIn, setRaccoonLoggingIn] = useState(false)
  const [raccoonLoginError, setRaccoonLoginError] = useState<string>()
  const [raccoonLogoutConfirm, setRaccoonLogoutConfirm] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [providerDrafts, setProviderDrafts] = useState<Record<string, ProviderDraft>>({})
  const [connectingProviderID, setConnectingProviderID] = useState<string>()
  const [providerError, setProviderError] = useState<string>()
  const [pendingAction, setPendingAction] = useState<{ kind: "disconnect" | "delete"; providerID: string; name: string }>()
  const [custom, setCustom] = useState<{
    providerID: string
    name: string
    package: CustomProviderPackage
    baseURL: string
    apiKey: string
    headers: CustomHeaderDraft[]
    models: CustomModelDraft[]
  }>({
    providerID: "",
    name: "",
    package: "@ai-sdk/openai-compatible",
    baseURL: "",
    apiKey: "",
    headers: [emptyCustomHeader()],
    models: [emptyCustomModel()],
  })
  const [editingProviderID, setEditingProviderID] = useState<string>()
  const [fetchingModels, setFetchingModels] = useState(false)
  const [fetchError, setFetchError] = useState<string>()
  const [fetchStatus, setFetchStatus] = useState<string>()
  const [fetchedModels, setFetchedModels] = useState<Array<{ id: string; name: string; supportsImage?: boolean }>>()
  const [selectedFetched, setSelectedFetched] = useState<Set<string>>(new Set())
  const [fetchedQuery, setFetchedQuery] = useState("")
  const [savingCustom, setSavingCustom] = useState(false)
  const [saveError, setSaveError] = useState<string>()

  useEffect(() => {
    return vscode.onMessage((message) => {
      if (message.type !== "customProviderModelsFetched") return
      setFetchingModels(false)
      if (message.error) {
        setFetchError(message.auth ? language.t("settings.providers.error.authFailed") : message.error)
        setFetchedModels(undefined)
        return
      }
      const existing = new Set(custom.models.map((model) => model.id.trim()).filter(Boolean))
      const models = (message.models ?? []).filter((model) => !existing.has(model.id))
      if (models.length === 0) {
        setFetchStatus(language.t("settings.providers.error.noNewModels"))
        setFetchedModels(undefined)
        return
      }
      setSelectedFetched(new Set(models.map((model) => model.id)))
      setFetchedModels(models)
      setFetchStatus(language.t("settings.providers.error.modelsFound", { count: models.length }))
    })
  }, [custom.models, language, vscode])

  useEffect(() => {
    return vscode.onMessage((message) => {
      if (message.type === "raccoonLoginFinished") {
        setRaccoonLoggingIn(false)
        setRaccoonLoginError(message.error)
        if (!message.error) setRaccoonDialogOpen(false)
        return
      }
      if (message.type === "providerConnectFinished") {
        setConnectingProviderID(undefined)
        setProviderError(message.error)
        if (!message.error) setActiveProvider(undefined)
        return
      }
      if (message.type === "customProviderSaved") {
        setSavingCustom(false)
        setCustomOpen(false)
        setEditingProviderID(undefined)
        setSaveError(undefined)
        return
      }
      if (message.type === "error" && savingCustom) {
        setSavingCustom(false)
        setSaveError(message.message)
      }
    })
  }, [savingCustom, vscode])

  const customProviders = config.customProviders ?? []
  // raccoon is a config-source provider, so `connected` is always true. Use the
  // ground-truth login flag from the extension instead.
  const raccoonConnected = config.raccoonLoggedIn === true
  const providerAuthMethods = config.providerAuthMethods ?? {}

  const customProviderIDs = useMemo(() => new Set(customProviders.map((item) => item.providerID)), [customProviders])
  const isCustomProvider = (id: string) => customProviderIDs.has(id)
  const sourceTag = (id: string, source?: string) => {
    if (isCustomProvider(id)) return language.t("settings.providers.custom")
    if (source === "env") return language.t("settings.providers.tag.environment")
    if (source === "api") return language.t("settings.providers.tag.apiKey")
    if (source === "config") return language.t("settings.providers.tag.config")
    return language.t("settings.providers.tag.apiKey")
  }
  const connectedProviders = useMemo(
    () => config.providers.filter((item) => item.connected && !builtinProviderIDs.has(item.id)),
    [config.providers],
  )
  const connectedIDs = useMemo(() => new Set(connectedProviders.map((item) => item.id)), [connectedProviders])
  const unconnectedPopular = HIDE_FOREIGN_PROVIDERS ? [] : popularProviders.filter((item) => !connectedIDs.has(item.id))
  const filteredFetchedModels = useMemo(() => {
    const text = fetchedQuery.trim().toLowerCase()
    if (!text) return fetchedModels ?? []
    return (fetchedModels ?? []).filter((model) => `${model.id} ${model.name}`.toLowerCase().includes(text))
  }, [fetchedModels, fetchedQuery])

  const fetchCustomModels = () => {
    if (!/^https?:\/\//.test(custom.baseURL.trim())) {
      setFetchError(language.t("settings.providers.error.baseUrl"))
      return
    }
    const headersResult = customHeaders(custom.headers)
    if (!headersResult.ok) {
      setFetchError(language.t("settings.providers.error.headers", { key: headersResult.key }))
      return
    }
    setFetchingModels(true)
    setFetchError(undefined)
    setFetchStatus(undefined)
    setFetchedModels(undefined)
    vscode.postMessage({
      type: "fetchCustomProviderModels",
      requestID: crypto.randomUUID(),
      baseURL: custom.baseURL.trim(),
      apiKey: custom.apiKey.trim() || undefined,
      headers: headersResult.headers,
    })
  }

  const addFetchedModels = () => {
    const picked = (fetchedModels ?? []).filter((model) => selectedFetched.has(model.id))
    if (picked.length === 0) return
    setCustom((current) => {
      const empty = current.models.length === 1 && !current.models[0]?.id.trim() && !current.models[0]?.name.trim()
      return { ...current, models: empty ? picked : [...current.models, ...picked] }
    })
    setFetchStatus(language.t("settings.providers.error.modelsAdded", { count: picked.length }))
    setFetchedModels(undefined)
    setFetchedQuery("")
  }

  const saveCustomProvider = () => {
    setSaveError(undefined)
    const providerID = custom.providerID.trim()
    const name = custom.name.trim()
    const baseURL = custom.baseURL.trim()
    const models = custom.models
      .map((model) => ({ id: model.id.trim(), name: model.name.trim(), supportsImage: model.supportsImage ?? false }))
      .filter((model) => model.id && model.name)
    if (!providerID || !name || !baseURL || models.length === 0) {
      setSaveError(language.t("settings.providers.error.customRequired"))
      return
    }
    if (!/^https?:\/\//.test(baseURL)) {
      setSaveError(language.t("settings.providers.error.baseUrl"))
      return
    }
    const headersResult = customHeaders(custom.headers)
    if (!headersResult.ok) {
      setSaveError(language.t("settings.providers.error.headers", { key: headersResult.key }))
      return
    }
    setSavingCustom(true)
    actions.configureCustomProvider({ ...custom, providerID, name, baseURL, headers: headersResult.headers, models, editing: !!editingProviderID })
  }

  const deleteCustomProvider = (providerID: string) => {
    if (!providerID) return
    setSaveError(undefined)
    setSavingCustom(true)
    vscode.postMessage({ type: "deleteCustomProvider", providerID })
  }

  const confirmPendingAction = () => {
    if (!pendingAction) return
    const { kind, providerID } = pendingAction
    setPendingAction(undefined)
    if (kind === "delete") {
      deleteCustomProvider(providerID)
      return
    }
    setProviderError(undefined)
    setConnectingProviderID(providerID)
    actions.disconnectProvider(providerID)
  }

  const editCustomProvider = (providerID: string) => {
    const provider = customProviders.find((item) => item.providerID === providerID)
    if (!provider) return
    setEditingProviderID(provider.providerID)
    setCustom({
      providerID: provider.providerID,
      name: provider.name,
      package: provider.package,
      baseURL: provider.baseURL,
      apiKey: "",
      headers: customHeaderDrafts(provider.headers),
      models: provider.models.length > 0 ? provider.models : [emptyCustomModel()],
    })
    setCustomOpen(true)
    setFetchError(undefined)
    setFetchStatus(undefined)
    setFetchedModels(undefined)
    setFetchedQuery("")
  }

  const openNewCustomProvider = () => {
    setEditingProviderID(undefined)
    setCustom({
      providerID: "",
      name: "",
      package: "@ai-sdk/openai-compatible",
      baseURL: "",
      apiKey: "",
      headers: [emptyCustomHeader()],
      models: [emptyCustomModel()],
    })
    setFetchError(undefined)
    setFetchStatus(undefined)
    setFetchedModels(undefined)
    setFetchedQuery("")
    setCustomOpen(true)
  }

  const providerDraft = (providerID: string) =>
    providerDrafts[providerID] ?? {
      methodIndex: 0,
      apiKey: "",
      inputs: {},
    }

  const updateProviderDraft = (providerID: string, updater: (draft: ProviderDraft) => ProviderDraft) => {
    setProviderDrafts((current) => ({
      ...current,
      [providerID]: updater(providerDraft(providerID)),
    }))
  }

  const connectProvider = (providerID: string, methods: RaccoonProviderAuthMethod[]) => {
    const draft = providerDraft(providerID)
    const method = methods[draft.methodIndex] ?? methods[0]
    if (!method) return
    const prompts = (method.prompts ?? []).filter((prompt) => visiblePrompt(prompt, draft.inputs))
    const inputs = Object.fromEntries(
      prompts.map((prompt) => [prompt.key, (draft.inputs[prompt.key] ?? "").trim()]).filter((entry) => entry[1]),
    )
    if (method.type === "api" && !draft.apiKey.trim()) {
      setProviderError(language.t("settings.providers.error.apiKeyRequired"))
      return
    }
    const missingPrompt = prompts.find((prompt) => !(draft.inputs[prompt.key] ?? "").trim())
    if (missingPrompt) {
      setProviderError(language.t("settings.providers.error.promptRequired", { prompt: missingPrompt.message }))
      return
    }
    setProviderError(undefined)
    setConnectingProviderID(providerID)
    actions.connectProvider({
      providerID,
      methodIndex: draft.methodIndex,
      apiKey: method.type === "api" ? draft.apiKey : undefined,
      inputs: Object.keys(inputs).length > 0 ? inputs : undefined,
    })
  }

  const closeRaccoonDialog = () => {
    if (raccoonLoggingIn) actions.cancelRaccoonLogin()
    setRaccoonLoggingIn(false)
    setRaccoonDialogOpen(false)
  }

  const closeProviderDialog = () => {
    if (activeProvider && connectingProviderID === activeProvider) actions.cancelProviderConnect(activeProvider)
    setConnectingProviderID(undefined)
    setActiveProvider(undefined)
  }

  return (
    <>
      <h3>{language.t("settings.providers.title")}</h3>

      {/* Raccoon — the default service the plugin must be logged into. Pinned. */}
      <div className="settings-card settings-provider-feature">
        <div className="settings-provider-row">
          <div className="settings-provider-mark">RC</div>
          <div className="settings-provider-main">
            <div className="settings-provider-name-row">
              <span className="settings-provider-name">Raccoon</span>
              <span className={`settings-provider-status ${raccoonConnected ? "connected" : ""}`}>
                {raccoonConnected ? language.t("common.configured") : language.t("common.notConfigured")}
              </span>
            </div>
            <div className="settings-provider-meta">{language.t("settings.providers.raccoon.note")}</div>
          </div>
          <div className="settings-provider-actions">
            {raccoonConnected ? (
              <Button disabled={raccoonLoggingIn} onClick={() => setRaccoonLogoutConfirm(true)}>
                {language.t("settings.providers.raccoon.logout")}
              </Button>
            ) : (
              <Button
                disabled={raccoonLoggingIn}
                onClick={() => {
                  setRaccoonLoginError(undefined)
                  setRaccoonDialogOpen(true)
                }}
              >
                {language.t("settings.providers.connect")}
              </Button>
            )}
          </div>
        </div>
        {raccoonLoginError ? <div className="settings-provider-error">{raccoonLoginError}</div> : null}
      </div>

      <h4>{language.t("settings.providers.section.connected")}</h4>
      <div className="settings-card">
        {connectedProviders.length > 0 ? (
          connectedProviders.map((item) => {
            const custom = isCustomProvider(item.id)
            return (
              <div className="settings-provider-block" key={item.id}>
                <div className="settings-provider-row">
                  <div className="settings-provider-mark">
                    <ProviderIcon id={item.id} name={item.name} />
                  </div>
                  <div className="settings-provider-main">
                    <div className="settings-provider-name-row">
                      <span className="settings-provider-name">{item.name}</span>
                      <span className="settings-provider-tag">{sourceTag(item.id, item.source)}</span>
                    </div>
                    <div className="settings-provider-meta">
                      {language.t("settings.providers.customProvider.models", { count: item.modelCount })}
                    </div>
                  </div>
                  <div className="settings-provider-actions">
                    {custom ? (
                      <>
                        <Button onClick={() => editCustomProvider(item.id)}>
                          {language.t("settings.providers.edit")}
                        </Button>
                        <Button
                          onClick={() => setPendingAction({ kind: "delete", providerID: item.id, name: item.name })}
                        >
                          {language.t("common.delete")}
                        </Button>
                      </>
                    ) : item.source === "env" ? (
                      <span className="settings-provider-from-env">{language.t("settings.providers.fromEnv")}</span>
                    ) : (
                      <Button
                        disabled={connectingProviderID === item.id}
                        onClick={() => setPendingAction({ kind: "disconnect", providerID: item.id, name: item.name })}
                      >
                        {language.t("settings.providers.disconnect")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="settings-provider-empty">{language.t("settings.providers.connected.empty")}</div>
        )}
      </div>

      <h4>{language.t(HIDE_FOREIGN_PROVIDERS ? "settings.providers.custom.title" : "settings.providers.section.popular")}</h4>
      <div className="settings-card">
        {unconnectedPopular.map((item) => (
          <div className="settings-provider-block" key={item.id}>
            <div className="settings-provider-row">
              <div className="settings-provider-mark">
                <ProviderIcon id={item.id} name={item.name} />
              </div>
              <div className="settings-provider-main">
                <div className="settings-provider-name-row">
                  <span className="settings-provider-name">{item.name}</span>
                </div>
                <div className="settings-provider-meta">{language.t(item.noteKey)}</div>
              </div>
              <div className="settings-provider-actions">
                <Button
                  onClick={() => {
                    setProviderError(undefined)
                    setActiveProvider(item.id)
                  }}
                >
                  {language.t("settings.providers.connect")}
                </Button>
              </div>
            </div>
          </div>
        ))}

        {/* Custom provider entry lives at the bottom of the popular list. */}
        <div className="settings-provider-block">
          <div className="settings-provider-row">
            <div className="settings-provider-mark">+</div>
            <div className="settings-provider-main">
              <div className="settings-provider-name-row">
                <span className="settings-provider-name">{language.t("settings.providers.customProvider")}</span>
                <span className="settings-provider-tag">{language.t("settings.providers.custom")}</span>
              </div>
              <div className="settings-provider-meta">{language.t("settings.providers.customProvider.note")}</div>
            </div>
            <div className="settings-provider-actions">
              <Button onClick={openNewCustomProvider}>{language.t("settings.providers.customProvider.add")}</Button>
            </div>
          </div>
        </div>
      </div>
      {customOpen ? (
        <SettingsCustomProviderDialog
          custom={custom}
          fetchedModels={fetchedModels}
          filteredFetchedModels={filteredFetchedModels}
          fetchedQuery={fetchedQuery}
          selectedFetched={selectedFetched}
          fetchingModels={fetchingModels}
          savingCustom={savingCustom}
          fetchError={fetchError}
          fetchStatus={fetchStatus}
          saveError={saveError}
          editing={!!editingProviderID}
          onClose={() => setCustomOpen(false)}
          onFetchModels={fetchCustomModels}
          onAddFetchedModels={addFetchedModels}
          onSave={saveCustomProvider}
          onFetchedQueryChange={setFetchedQuery}
          onSelectedFetchedChange={setSelectedFetched}
          onCustomChange={setCustom}
        />
      ) : null}
      {activeProvider ? (
        <SettingsProviderConnectDialog
          providerID={activeProvider}
          name={popularProviders.find((item) => item.id === activeProvider)?.name ?? activeProvider}
          connected={!!config.providers.find((entry) => entry.id === activeProvider)?.connected}
          methods={providerAuthMethods[activeProvider] ?? [apiKeyMethod]}
          draft={providerDraft(activeProvider)}
          error={providerError}
          connecting={connectingProviderID === activeProvider}
          onClose={closeProviderDialog}
          onMethodChange={(methodIndex) => {
            updateProviderDraft(activeProvider, (current) => ({ ...current, methodIndex, inputs: {} }))
            setProviderError(undefined)
          }}
          onApiKeyChange={(value) => {
            updateProviderDraft(activeProvider, (current) => ({ ...current, apiKey: value }))
            setProviderError(undefined)
          }}
          onInputChange={(key, value) => {
            updateProviderDraft(activeProvider, (current) => ({
              ...current,
              inputs: { ...current.inputs, [key]: value },
            }))
            setProviderError(undefined)
          }}
          onConnect={() => {
            const methods = providerAuthMethods[activeProvider] ?? [apiKeyMethod]
            connectProvider(activeProvider, methods)
          }}
        />
      ) : null}
      {raccoonDialogOpen ? (
        <SettingsDialog
          titleId="raccoon-connect-title"
          title="Raccoon"
          subtitle={raccoonConnected ? language.t("common.configured") : language.t("common.notConfigured")}
          onClose={closeRaccoonDialog}
          className="settings-provider-connect-dialog"
          headerClassName="settings-provider-connect-header"
          bodyClassName="settings-provider-connect-body"
          footerClassName="settings-provider-connect-footer"
          footer={
            <>
              <Button onClick={closeRaccoonDialog}>{language.t("common.cancel")}</Button>
              <Button
                disabled={raccoonLoggingIn}
                onClick={() => {
                  setRaccoonLoggingIn(true)
                  setRaccoonLoginError(undefined)
                  actions.loginRaccoon({
                    method: "browser",
                    serverUrl: raccoonServerUrl.trim() || RACCOON_LOGIN_URL,
                  })
                }}
              >
                {raccoonLoggingIn ? language.t("settings.providers.raccoon.waiting") : language.t("settings.providers.raccoon.openBrowser")}
              </Button>
            </>
          }
        >
          <TextField
            label={language.t("settings.providers.raccoon.serverUrl")}
            value={raccoonServerUrl}
            placeholder={RACCOON_LOGIN_URL}
            onChange={setRaccoonServerUrl}
          />
          {raccoonLoginError ? <div className="settings-dialog-error">{raccoonLoginError}</div> : null}
        </SettingsDialog>
      ) : null}
      {raccoonLogoutConfirm ? (
        <SettingsDialog
          titleId="raccoon-logout-confirm"
          title={language.t("settings.providers.raccoon.logout")}
          className="settings-raccoon-logout-dialog"
          onClose={() => setRaccoonLogoutConfirm(false)}
          footer={
            <>
              <Button onClick={() => setRaccoonLogoutConfirm(false)}>{language.t("common.cancel")}</Button>
              <Button
                onClick={() => {
                  setRaccoonLogoutConfirm(false)
                  actions.logoutRaccoon()
                }}
              >
                {language.t("common.confirm")}
              </Button>
            </>
          }
        >
          <div>{language.t("settings.providers.raccoon.logoutConfirm")}</div>
        </SettingsDialog>
      ) : null}
      {pendingAction ? (
        <SettingsDialog
          titleId="provider-action-confirm"
          title={
            pendingAction.kind === "delete"
              ? language.t("settings.customProvider.delete")
              : language.t("settings.providers.disconnect")
          }
          className="settings-raccoon-logout-dialog"
          onClose={() => setPendingAction(undefined)}
          footer={
            <>
              <Button onClick={() => setPendingAction(undefined)}>{language.t("common.cancel")}</Button>
              <Button onClick={confirmPendingAction}>{language.t("common.confirm")}</Button>
            </>
          }
        >
          <div>
            {language.t(
              pendingAction.kind === "delete"
                ? "settings.providers.deleteConfirm"
                : "settings.providers.disconnectConfirm",
              { name: pendingAction.name },
            )}
          </div>
        </SettingsDialog>
      ) : null}
    </>
  )
}
