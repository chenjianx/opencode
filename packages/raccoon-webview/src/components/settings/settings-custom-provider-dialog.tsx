import { X } from "@phosphor-icons/react"
import { useLanguage } from "../../context/language"
import { SettingsDialog } from "./settings-dialog"
import { Button } from "../ui"
import { TextField, TextInput } from "./settings-common"

type CustomProviderDraft = {
  providerID: string
  name: string
  baseURL: string
  apiKey: string
  headers: Array<{ key: string; value: string }>
  models: Array<{ id: string; name: string; supportsImage?: boolean }>
}

export function SettingsCustomProviderDialog(props: {
  custom: CustomProviderDraft
  fetchedModels?: Array<{ id: string; name: string; supportsImage?: boolean }>
  filteredFetchedModels: Array<{ id: string; name: string; supportsImage?: boolean }>
  fetchedQuery: string
  selectedFetched: Set<string>
  fetchingModels: boolean
  savingCustom: boolean
  fetchError?: string
  fetchStatus?: string
  saveError?: string
  editing?: boolean
  onClose: () => void
  onFetchModels: () => void
  onAddFetchedModels: () => void
  onSave: () => void
  onFetchedQueryChange: (value: string) => void
  onSelectedFetchedChange: (value: Set<string>) => void
  onCustomChange: (updater: (current: CustomProviderDraft) => CustomProviderDraft) => void
}) {
  const language = useLanguage()

  return (
    <SettingsDialog
      titleId="custom-provider-title"
      title={language.t("settings.customProvider.title")}
      subtitle={language.t("settings.customProvider.subtitle")}
      onClose={props.onClose}
      className="settings-custom-provider-dialog"
      footer={
        <>
          <Button disabled={props.savingCustom} onClick={props.onClose}>
            {language.t("common.cancel")}
          </Button>
          <Button disabled={props.savingCustom} onClick={props.onSave}>
            {props.savingCustom ? language.t("common.saving") : language.t("settings.customProvider.save")}
          </Button>
        </>
      }
    >
      <div className="settings-dialog-grid">
            <TextField
              label={language.t("settings.customProvider.providerID")}
              value={props.custom.providerID}
              placeholder={language.t("settings.customProvider.providerID.placeholder")}
              help={language.t("settings.customProvider.providerID.help")}
              disabled={props.editing}
              onChange={(value) => props.onCustomChange((current) => ({ ...current, providerID: value }))}
            />
            <TextField
              label={language.t("settings.customProvider.displayName")}
              value={props.custom.name}
              placeholder={language.t("settings.customProvider.displayName.placeholder")}
              onChange={(value) => props.onCustomChange((current) => ({ ...current, name: value }))}
            />
          </div>
          <TextField
            label={language.t("settings.customProvider.baseUrl")}
            value={props.custom.baseURL}
            placeholder={language.t("settings.customProvider.baseUrl.placeholder")}
            onChange={(value) => props.onCustomChange((current) => ({ ...current, baseURL: value }))}
          />
          <TextField
            label={language.t("settings.customProvider.apiKey")}
            type="password"
            value={props.custom.apiKey}
            placeholder={language.t("settings.customProvider.apiKey.placeholder")}
            onChange={(value) => props.onCustomChange((current) => ({ ...current, apiKey: value }))}
          />
          <div className="settings-dialog-models">
            <div className="settings-dialog-section">
              <div>
                <div className="settings-dialog-section-title">{language.t("settings.customProvider.headers")}</div>
                <div className="settings-dialog-section-description">{language.t("settings.customProvider.headers.help")}</div>
              </div>
            </div>
            {props.custom.headers.map((header, index) => (
              <div className="settings-dialog-header-row" key={index}>
                <TextInput
                  value={header.key}
                  placeholder={language.t("settings.customProvider.headerKey.placeholder")}
                  onChange={(value) =>
                    props.onCustomChange((current) => ({
                      ...current,
                      headers: current.headers.map((item, itemIndex) => (itemIndex === index ? { ...item, key: value } : item)),
                    }))
                  }
                />
                <TextInput
                  value={header.value}
                  placeholder={language.t("settings.customProvider.headerValue.placeholder")}
                  onChange={(value) =>
                    props.onCustomChange((current) => ({
                      ...current,
                      headers: current.headers.map((item, itemIndex) => (itemIndex === index ? { ...item, value } : item)),
                    }))
                  }
                />
                <Button
                  variant="icon"
                  className="settings-dialog-icon-button"
                  disabled={props.custom.headers.length <= 1}
                  onClick={() =>
                    props.onCustomChange((current) => ({
                      ...current,
                      headers: current.headers.filter((_, itemIndex) => itemIndex !== index),
                    }))
                  }
                  aria-label={language.t("settings.customProvider.removeHeader")}
                >
                  <X size={12} weight="bold" />
                </Button>
              </div>
            ))}
            <Button
              onClick={() =>
                props.onCustomChange((current) => ({ ...current, headers: [...current.headers, { key: "", value: "" }] }))
              }
            >
              {language.t("settings.customProvider.addHeader")}
            </Button>
          </div>

          <div className="settings-dialog-models">
            <div className="settings-dialog-section">
              <div>
                <div className="settings-dialog-section-title">{language.t("settings.customProvider.models")}</div>
                <div className="settings-dialog-section-description">{language.t("settings.customProvider.models.description")}</div>
              </div>
              <Button disabled={props.fetchingModels} onClick={props.onFetchModels}>
                {props.fetchingModels ? language.t("settings.customProvider.fetching") : language.t("settings.customProvider.fetch")}
              </Button>
            </div>
            {props.fetchError ? <div className="settings-dialog-error">{props.fetchError}</div> : null}
            {props.fetchStatus ? <div className="settings-dialog-note">{props.fetchStatus}</div> : null}
            {props.saveError ? <div className="settings-dialog-error">{props.saveError}</div> : null}
            {props.fetchedModels ? (
              <div className="settings-dialog-fetched">
                <div className="settings-dialog-fetched-header">
                  <TextInput
                    value={props.fetchedQuery}
                    placeholder={language.t("settings.customProvider.searchFetched")}
                    onChange={props.onFetchedQueryChange}
                  />
                  <Button onClick={props.onAddFetchedModels}>
                    {language.t("settings.customProvider.addSelected", { count: props.selectedFetched.size })}
                  </Button>
                </div>
                <div className="settings-dialog-fetched-list">
                  {props.filteredFetchedModels.map((model) => (
                    <label className="settings-dialog-fetched-row" key={model.id}>
                      <input
                        type="checkbox"
                        checked={props.selectedFetched.has(model.id)}
                        onChange={() => {
                          const next = new Set(props.selectedFetched)
                          if (next.has(model.id)) next.delete(model.id)
                          else next.add(model.id)
                          props.onSelectedFetchedChange(next)
                        }}
                      />
                      <span>{model.id}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            {props.custom.models.map((model, index) => (
              <div className="settings-dialog-model-row" key={index}>
                <TextInput
                  value={model.id}
                  placeholder={language.t("settings.customProvider.modelID.placeholder")}
                  onChange={(value) =>
                    props.onCustomChange((current) => ({
                      ...current,
                      models: current.models.map((item, itemIndex) => (itemIndex === index ? { ...item, id: value } : item)),
                    }))
                  }
                />
                <TextInput
                  value={model.name}
                  placeholder={language.t("settings.customProvider.modelName.placeholder")}
                  onChange={(value) =>
                    props.onCustomChange((current) => ({
                      ...current,
                      models: current.models.map((item, itemIndex) => (itemIndex === index ? { ...item, name: value } : item)),
                    }))
                  }
                />
                <label className="settings-dialog-model-capability">
                  <input
                    type="checkbox"
                    checked={model.supportsImage ?? false}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked
                      props.onCustomChange((current) => ({
                        ...current,
                        models: current.models.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, supportsImage: checked } : item,
                        ),
                      }))
                    }}
                  />
                  <span>{language.t("settings.customProvider.image")}</span>
                </label>
                <Button
                  variant="icon"
                  className="settings-dialog-icon-button"
                  disabled={props.custom.models.length <= 1}
                  onClick={() =>
                    props.onCustomChange((current) => ({
                      ...current,
                      models: current.models.filter((_, itemIndex) => itemIndex !== index),
                    }))
                  }
                  aria-label={language.t("settings.customProvider.removeModel")}
                >
                  <X size={12} weight="bold" />
                </Button>
              </div>
            ))}
            <Button
              onClick={() =>
                props.onCustomChange((current) => ({ ...current, models: [...current.models, { id: "", name: "", supportsImage: false }] }))
              }
            >
              {language.t("settings.customProvider.addModel")}
            </Button>
          </div>
    </SettingsDialog>
  )
}
