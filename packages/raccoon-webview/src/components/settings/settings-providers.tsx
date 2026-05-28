import { useEffect, useMemo, useState } from "react"
import { useLanguage } from "../../context/language"
import { useSession } from "../../context/session"
import { useVSCode } from "../../context/vscode"
import type { RaccoonProviderAuthMethod } from "../../protocol"
import { SettingsCustomProviderDialog } from "./settings-custom-provider-dialog"
import { SettingsProviderConnectDialog } from "./settings-provider-connect-dialog"

const popularProviders = [
  { id: "openai", name: "OpenAI", noteKey: "settings.providers.openai.note" },
  { id: "anthropic", name: "Anthropic", noteKey: "settings.providers.anthropic.note" },
  { id: "google", name: "Google", noteKey: "settings.providers.google.note" },
  { id: "openrouter", name: "OpenRouter", noteKey: "settings.providers.openrouter.note" },
  { id: "copilot", name: "GitHub Copilot", noteKey: "settings.providers.copilot.note" },
] as const

const emptyCustomModel = () => ({ id: "", name: "" })
const raccoonLoginUrl = "http://10.4.196.193:5580"

type ProviderDraft = {
  methodIndex: number
  apiKey: string
  inputs: Record<string, string>
}

type Prompt = NonNullable<RaccoonProviderAuthMethod["prompts"]>[number]

function visiblePrompt(prompt: Prompt, values: Record<string, string>) {
  if (!prompt.when) return true
  const value = values[prompt.when.key] ?? ""
  if (prompt.when.op === "eq") return value === prompt.when.value
  return value !== prompt.when.value
}

export function SettingsProviders() {
  const language = useLanguage()
  const session = useSession()
  const vscode = useVSCode()
  const apiKeyMethod: RaccoonProviderAuthMethod = { type: "api", label: language.t("settings.providers.connect.apiKey") }
  const [activeProvider, setActiveProvider] = useState<string>()
  const [raccoonDialogOpen, setRaccoonDialogOpen] = useState(false)
  const [raccoonServerUrl, setRaccoonServerUrl] = useState(raccoonLoginUrl)
  const [raccoonLoggingIn, setRaccoonLoggingIn] = useState(false)
  const [raccoonLoginError, setRaccoonLoginError] = useState<string>()
  const [customOpen, setCustomOpen] = useState(false)
  const [providerDrafts, setProviderDrafts] = useState<Record<string, ProviderDraft>>({})
  const [connectingProviderID, setConnectingProviderID] = useState<string>()
  const [providerError, setProviderError] = useState<string>()
  const [custom, setCustom] = useState({
    providerID: "",
    name: "",
    baseURL: "",
    apiKey: "",
    models: [emptyCustomModel()],
  })
  const [editingProviderID, setEditingProviderID] = useState<string>()
  const [fetchingModels, setFetchingModels] = useState(false)
  const [fetchError, setFetchError] = useState<string>()
  const [fetchStatus, setFetchStatus] = useState<string>()
  const [fetchedModels, setFetchedModels] = useState<Array<{ id: string; name: string }>>()
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

  const customProviders = session.state.customProviders ?? []
  const raccoonProvider = session.state.providers.find((entry) => entry.id === "raccoon")
  const raccoonConnected = raccoonProvider?.connected ?? false
  const providerAuthMethods = session.state.providerAuthMethods ?? {}
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
    setFetchingModels(true)
    setFetchError(undefined)
    setFetchStatus(undefined)
    setFetchedModels(undefined)
    vscode.postMessage({
      type: "fetchCustomProviderModels",
      requestID: crypto.randomUUID(),
      baseURL: custom.baseURL.trim(),
      apiKey: custom.apiKey.trim() || undefined,
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
    const models = custom.models.map((model) => ({ id: model.id.trim(), name: model.name.trim() })).filter((model) => model.id && model.name)
    if (!providerID || !name || !baseURL || models.length === 0) {
      setSaveError(language.t("settings.providers.error.customRequired"))
      return
    }
    if (!/^https?:\/\//.test(baseURL)) {
      setSaveError(language.t("settings.providers.error.baseUrl"))
      return
    }
    setSavingCustom(true)
    session.configureCustomProvider({ ...custom, providerID, name, baseURL, models, editing: !!editingProviderID })
  }

  const deleteCustomProvider = () => {
    if (!editingProviderID) return
    setSaveError(undefined)
    setSavingCustom(true)
    vscode.postMessage({ type: "deleteCustomProvider", providerID: editingProviderID })
  }

  const editCustomProvider = (providerID: string) => {
    const provider = customProviders.find((item) => item.providerID === providerID)
    if (!provider) return
    setEditingProviderID(provider.providerID)
    setCustom({
      providerID: provider.providerID,
      name: provider.name,
      baseURL: provider.baseURL,
      apiKey: "",
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
      baseURL: "",
      apiKey: "",
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
    session.connectProvider({
      providerID,
      methodIndex: draft.methodIndex,
      apiKey: method.type === "api" ? draft.apiKey : undefined,
      inputs: Object.keys(inputs).length > 0 ? inputs : undefined,
    })
  }

  const closeRaccoonDialog = () => {
    if (raccoonLoggingIn) session.cancelRaccoonLogin()
    setRaccoonLoggingIn(false)
    setRaccoonDialogOpen(false)
  }

  const closeProviderDialog = () => {
    if (activeProvider && connectingProviderID === activeProvider) session.cancelProviderConnect(activeProvider)
    setConnectingProviderID(undefined)
    setActiveProvider(undefined)
  }

  return (
    <>
      <h3>{language.t("settings.providers.title")}</h3>
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
            <button
              type="button"
              disabled={raccoonLoggingIn}
              onClick={() => {
                setRaccoonLoginError(undefined)
                setRaccoonDialogOpen(true)
              }}
            >
              {raccoonConnected ? language.t("settings.providers.reconnect") : language.t("settings.providers.connect")}
            </button>
          </div>
        </div>
        {raccoonLoginError ? <div className="settings-provider-error">{raccoonLoginError}</div> : null}
      </div>

      <div className="settings-card settings-provider-feature">
        <div className="settings-provider-row">
          <div className="settings-provider-mark">OC</div>
          <div className="settings-provider-main">
            <div className="settings-provider-name-row">
              <span className="settings-provider-name">{language.t("settings.providers.freeModels")}</span>
              <span className="settings-provider-status connected">{language.t("settings.providers.available")}</span>
              <span className="settings-provider-tag">{language.t("settings.providers.free")}</span>
            </div>
            <div className="settings-provider-meta">{language.t("settings.providers.freeModels.note")}</div>
          </div>
          <div className="settings-provider-actions">
            <button type="button" onClick={() => session.configureProvider("opencode", "")}>
              {language.t("settings.providers.enable")}
            </button>
          </div>
        </div>
      </div>

      <h4>{language.t("settings.providers.common")}</h4>
      <div className="settings-card">
        {popularProviders.map((item) => {
          const provider = session.state.providers.find((entry) => entry.id === item.id)
          const connected = provider?.connected ?? false
          const authMethods = providerAuthMethods[item.id]
          const methods: RaccoonProviderAuthMethod[] = authMethods && authMethods.length > 0 ? authMethods : [apiKeyMethod]
          return (
            <div className="settings-provider-block" key={item.id}>
              <div className="settings-provider-row">
                <div className="settings-provider-mark">{item.name.slice(0, 2).toUpperCase()}</div>
                <div className="settings-provider-main">
                  <div className="settings-provider-name-row">
                    <span className="settings-provider-name">{item.name}</span>
                    <span className={`settings-provider-status ${connected ? "connected" : ""}`}>
                      {connected ? language.t("common.configured") : language.t("common.notConfigured")}
                    </span>
                  </div>
                  <div className="settings-provider-meta">{language.t(item.noteKey)}</div>
                </div>
                <div className="settings-provider-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setProviderError(undefined)
                      setActiveProvider(item.id)
                    }}
                  >
                    {connected ? language.t("settings.providers.edit") : language.t("settings.providers.configure")}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <h4>{language.t("settings.providers.custom.title")}</h4>
      <div className="settings-card">
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
              <button type="button" onClick={openNewCustomProvider}>
                {language.t("settings.providers.customProvider.add")}
              </button>
            </div>
          </div>
        </div>
        {customProviders.length > 0 ? (
          <div className="settings-provider-list">
            {customProviders.map((item) => (
              <div className="settings-provider-row" key={item.providerID}>
                <div className="settings-provider-mark">{item.name.slice(0, 2).toUpperCase()}</div>
                <div className="settings-provider-main">
                  <div className="settings-provider-name-row">
                    <span className="settings-provider-name">{item.name}</span>
                    <span className="settings-provider-tag">{language.t("settings.providers.custom")}</span>
                  </div>
                  <div className="settings-provider-meta">
                    {item.providerID} · {language.t("settings.providers.customProvider.models", { count: item.models.length })}
                  </div>
                </div>
                <div className="settings-provider-actions">
                  <button type="button" onClick={() => editCustomProvider(item.providerID)}>
                    {language.t("settings.providers.edit")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
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
          onClose={() => setCustomOpen(false)}
          onFetchModels={fetchCustomModels}
          onAddFetchedModels={addFetchedModels}
          onSave={saveCustomProvider}
          onDelete={editingProviderID ? deleteCustomProvider : undefined}
          onFetchedQueryChange={setFetchedQuery}
          onSelectedFetchedChange={setSelectedFetched}
          onCustomChange={setCustom}
        />
      ) : null}
      {activeProvider ? (
        <SettingsProviderConnectDialog
          providerID={activeProvider}
          name={popularProviders.find((item) => item.id === activeProvider)?.name ?? activeProvider}
          connected={!!session.state.providers.find((entry) => entry.id === activeProvider)?.connected}
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
        <div className="settings-dialog-backdrop" role="presentation">
          <div className="settings-dialog settings-provider-connect-dialog" role="dialog" aria-modal="true" aria-labelledby="raccoon-connect-title">
            <div className="settings-dialog-header settings-provider-connect-header">
              <div>
                <div className="settings-dialog-title" id="raccoon-connect-title">
                  Raccoon
                </div>
                <div className="settings-dialog-subtitle">
                  {raccoonConnected ? language.t("common.configured") : language.t("common.notConfigured")}
                </div>
              </div>
              <button type="button" className="settings-dialog-icon-button" onClick={closeRaccoonDialog} aria-label={language.t("common.close")}>
                ×
              </button>
            </div>
            <div className="settings-dialog-body settings-provider-connect-body">
              <label className="settings-dialog-field">
                <span>{language.t("settings.providers.raccoon.serverUrl")}</span>
                <input
                  className="settings-provider-input"
                  value={raccoonServerUrl}
                  placeholder={raccoonLoginUrl}
                  onChange={(event) => setRaccoonServerUrl(event.currentTarget.value)}
                />
              </label>
              {raccoonLoginError ? <div className="settings-dialog-error">{raccoonLoginError}</div> : null}
            </div>
            <div className="settings-dialog-footer settings-provider-connect-footer">
              <button type="button" onClick={closeRaccoonDialog}>
                {language.t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={raccoonLoggingIn}
                onClick={() => {
                  setRaccoonLoggingIn(true)
                  setRaccoonLoginError(undefined)
                  session.loginRaccoon(raccoonServerUrl.trim() || raccoonLoginUrl)
                }}
              >
                {raccoonLoggingIn ? language.t("settings.providers.raccoon.waiting") : language.t("settings.providers.raccoon.openBrowser")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
