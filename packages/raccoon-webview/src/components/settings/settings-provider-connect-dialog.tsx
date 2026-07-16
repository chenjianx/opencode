import type { RaccoonProviderAuthMethod } from "../../protocol"
import { useLanguage } from "../../context/language"
import { SettingsDialog } from "./settings-dialog"
import { Button } from "../ui"
import { SelectField, TextField } from "./settings-common"
import { visiblePrompt } from "./utils"

type ProviderDraft = {
  methodIndex: number
  apiKey: string
  inputs: Record<string, string>
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
    <SettingsDialog
      titleId="provider-connect-title"
      title={props.name}
      subtitle={props.connected ? language.t("common.configured") : language.t("common.notConfigured")}
      onClose={props.onClose}
      className="settings-provider-connect-dialog"
      headerClassName="settings-provider-connect-header"
      bodyClassName="settings-provider-connect-body"
      footerClassName="settings-provider-connect-footer"
      footer={
        <>
          <Button onClick={props.onClose}>{language.t("common.cancel")}</Button>
          <Button onClick={props.onConnect} disabled={props.connecting}>
            {props.connecting
              ? language.t("settings.providers.connect.connecting")
              : method.type === "oauth"
                ? language.t("settings.providers.connect.connectProvider")
                : language.t("settings.providers.connect.saveProvider")}
          </Button>
        </>
      }
    >
      {props.methods.length > 1 ? (
            <SelectField
              label={language.t("settings.providers.connect.method")}
              value={String(props.draft.methodIndex)}
              onChange={(value) => props.onMethodChange(Number(value))}
              options={props.methods.map((entry, index) => ({ value: String(index), label: entry.label }))}
            />
          ) : null}
          {method.type === "api" ? (
            <TextField
              label={language.t("settings.providers.connect.apiKey")}
              type="password"
              value={props.draft.apiKey}
              placeholder={language.t("settings.providers.connect.apiKey.placeholder")}
              onChange={props.onApiKeyChange}
            />
          ) : (
            <div className="settings-provider-connect-note">{language.t("settings.providers.connect.browser")}</div>
          )}
          {prompts.map((prompt) =>
            prompt.type === "select" ? (
              <SelectField
                key={prompt.key}
                label={prompt.message}
                value={props.draft.inputs[prompt.key] ?? ""}
                placeholder={language.t("common.select")}
                options={prompt.options.map((option) => ({ value: option.value, label: optionText(option) }))}
                onChange={(value) => props.onInputChange(prompt.key, value)}
              />
            ) : (
              <TextField
                key={prompt.key}
                label={prompt.message}
                value={props.draft.inputs[prompt.key] ?? ""}
                placeholder={prompt.placeholder ?? ""}
                onChange={(value) => props.onInputChange(prompt.key, value)}
              />
            ),
          )}
          {props.error ? <div className="settings-dialog-error">{props.error}</div> : null}
    </SettingsDialog>
  )
}
