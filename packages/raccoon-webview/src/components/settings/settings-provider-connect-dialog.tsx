import type { RaccoonProviderAuthMethod } from "../../protocol"
import { useLanguage } from "../../context/language"

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

function optionText(option: { label: string; value: string; hint?: string }) {
  return option.hint ? `${option.label} (${option.hint})` : option.label
}

export function SettingsProviderConnectDialog(props: {
  providerID: string
  name: string
  connected: boolean
  methods: RaccoonProviderAuthMethod[]
  draft: ProviderDraft
  error?: string
  connecting: boolean
  onClose: () => void
  onMethodChange: (methodIndex: number) => void
  onApiKeyChange: (value: string) => void
  onInputChange: (key: string, value: string) => void
  onConnect: () => void
}) {
  const language = useLanguage()
  const method = props.methods[props.draft.methodIndex] ?? props.methods[0]
  if (!method) return null
  const prompts = (method.prompts ?? []).filter((prompt) => visiblePrompt(prompt, props.draft.inputs))

  return (
    <div className="settings-dialog-backdrop" role="presentation">
      <div className="settings-dialog settings-provider-connect-dialog" role="dialog" aria-modal="true" aria-labelledby="provider-connect-title">
        <div className="settings-dialog-header settings-provider-connect-header">
          <div>
            <div className="settings-dialog-title" id="provider-connect-title">
              {props.name}
            </div>
            <div className="settings-dialog-subtitle">
              {props.connected ? language.t("common.configured") : language.t("common.notConfigured")}
            </div>
          </div>
          <button type="button" className="settings-dialog-icon-button" onClick={props.onClose} aria-label={language.t("common.close")}>
            ×
          </button>
        </div>
        <div className="settings-dialog-body settings-provider-connect-body">
          {props.methods.length > 1 ? (
            <label className="settings-dialog-field">
              <span>{language.t("settings.providers.connect.method")}</span>
              <select
                className="settings-provider-input"
                value={props.draft.methodIndex}
                onChange={(event) => props.onMethodChange(Number(event.currentTarget.value))}
              >
                {props.methods.map((entry, index) => (
                  <option value={index} key={`${entry.type}-${entry.label}`}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {method.type === "api" ? (
            <label className="settings-dialog-field">
              <span>{language.t("settings.providers.connect.apiKey")}</span>
              <input
                className="settings-provider-input"
                type="password"
                value={props.draft.apiKey}
                placeholder={language.t("settings.providers.connect.apiKey.placeholder")}
                onChange={(event) => props.onApiKeyChange(event.currentTarget.value)}
              />
            </label>
          ) : (
            <div className="settings-provider-connect-note">{language.t("settings.providers.connect.browser")}</div>
          )}
          {prompts.map((prompt) => (
            <label className="settings-dialog-field" key={prompt.key}>
              <span>{prompt.message}</span>
              {prompt.type === "select" ? (
                <select
                  className="settings-provider-input"
                  value={props.draft.inputs[prompt.key] ?? ""}
                  onChange={(event) => props.onInputChange(prompt.key, event.currentTarget.value)}
                >
                  <option value="">{language.t("common.select")}</option>
                  {prompt.options.map((option) => (
                    <option value={option.value} key={option.value}>
                      {optionText(option)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="settings-provider-input"
                  value={props.draft.inputs[prompt.key] ?? ""}
                  placeholder={prompt.placeholder ?? ""}
                  onChange={(event) => props.onInputChange(prompt.key, event.currentTarget.value)}
                />
              )}
            </label>
          ))}
          {props.error ? <div className="settings-dialog-error">{props.error}</div> : null}
        </div>
        <div className="settings-dialog-footer settings-provider-connect-footer">
          <button type="button" onClick={props.onClose}>
            {language.t("common.cancel")}
          </button>
          <button type="button" onClick={props.onConnect} disabled={props.connecting}>
            {props.connecting
              ? language.t("settings.providers.connect.connecting")
              : method.type === "oauth"
                ? language.t("settings.providers.connect.connectProvider")
                : language.t("settings.providers.connect.saveProvider")}
          </button>
        </div>
      </div>
    </div>
  )
}
