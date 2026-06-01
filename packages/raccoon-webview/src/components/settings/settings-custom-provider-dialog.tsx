import { useLanguage } from "../../context/language"

type CustomProviderDraft = {
  providerID: string
  name: string
  baseURL: string
  apiKey: string
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
  onClose: () => void
  onFetchModels: () => void
  onAddFetchedModels: () => void
  onSave: () => void
  onDelete?: () => void
  onFetchedQueryChange: (value: string) => void
  onSelectedFetchedChange: (value: Set<string>) => void
  onCustomChange: (updater: (current: CustomProviderDraft) => CustomProviderDraft) => void
}) {
  const language = useLanguage()

  return (
    <div className="settings-dialog-backdrop" role="presentation">
      <div className="settings-dialog settings-custom-provider-dialog" role="dialog" aria-modal="true" aria-labelledby="custom-provider-title">
        <div className="settings-dialog-header">
          <div>
            <div className="settings-dialog-title" id="custom-provider-title">
              {language.t("settings.customProvider.title")}
            </div>
            <div className="settings-dialog-subtitle">{language.t("settings.customProvider.subtitle")}</div>
          </div>
          <button type="button" className="settings-dialog-icon-button" onClick={props.onClose} aria-label={language.t("common.close")}>
            ×
          </button>
        </div>
        <div className="settings-dialog-body">
          <div className="settings-dialog-grid">
            <label className="settings-dialog-field">
              <span>{language.t("settings.customProvider.providerID")}</span>
              <input
                className="settings-provider-input"
                value={props.custom.providerID}
                placeholder={language.t("settings.customProvider.providerID.placeholder")}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  props.onCustomChange((current) => ({ ...current, providerID: value }))
                }}
              />
              <small>{language.t("settings.customProvider.providerID.help")}</small>
            </label>
            <label className="settings-dialog-field">
              <span>{language.t("settings.customProvider.displayName")}</span>
              <input
                className="settings-provider-input"
                value={props.custom.name}
                placeholder={language.t("settings.customProvider.displayName.placeholder")}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  props.onCustomChange((current) => ({ ...current, name: value }))
                }}
              />
            </label>
          </div>
          <label className="settings-dialog-field">
            <span>{language.t("settings.customProvider.baseUrl")}</span>
            <input
              className="settings-provider-input"
              value={props.custom.baseURL}
              placeholder={language.t("settings.customProvider.baseUrl.placeholder")}
              onChange={(event) => {
                const value = event.currentTarget.value
                props.onCustomChange((current) => ({ ...current, baseURL: value }))
              }}
            />
          </label>
          <label className="settings-dialog-field">
            <span>{language.t("settings.customProvider.apiKey")}</span>
            <input
              className="settings-provider-input"
              type="password"
              value={props.custom.apiKey}
              placeholder={language.t("settings.customProvider.apiKey.placeholder")}
              onChange={(event) => {
                const value = event.currentTarget.value
                props.onCustomChange((current) => ({ ...current, apiKey: value }))
              }}
            />
          </label>

          <div className="settings-dialog-models">
            <div className="settings-dialog-section">
              <div>
                <div className="settings-dialog-section-title">{language.t("settings.customProvider.models")}</div>
                <div className="settings-dialog-section-description">{language.t("settings.customProvider.models.description")}</div>
              </div>
              <button type="button" className="settings-dialog-secondary" disabled={props.fetchingModels} onClick={props.onFetchModels}>
                {props.fetchingModels ? language.t("settings.customProvider.fetching") : language.t("settings.customProvider.fetch")}
              </button>
            </div>
            {props.fetchError ? <div className="settings-dialog-error">{props.fetchError}</div> : null}
            {props.fetchStatus ? <div className="settings-dialog-note">{props.fetchStatus}</div> : null}
            {props.saveError ? <div className="settings-dialog-error">{props.saveError}</div> : null}
            {props.fetchedModels ? (
              <div className="settings-dialog-fetched">
                <div className="settings-dialog-fetched-header">
                  <input
                    className="settings-provider-input"
                    value={props.fetchedQuery}
                    placeholder={language.t("settings.customProvider.searchFetched")}
                    onChange={(event) => props.onFetchedQueryChange(event.currentTarget.value)}
                  />
                  <button type="button" className="settings-dialog-secondary" onClick={props.onAddFetchedModels}>
                    {language.t("settings.customProvider.addSelected", { count: props.selectedFetched.size })}
                  </button>
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
                <input
                  className="settings-provider-input"
                  value={model.id}
                  placeholder={language.t("settings.customProvider.modelID.placeholder")}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    props.onCustomChange((current) => ({
                      ...current,
                      models: current.models.map((item, itemIndex) => (itemIndex === index ? { ...item, id: value } : item)),
                    }))
                  }}
                />
                <input
                  className="settings-provider-input"
                  value={model.name}
                  placeholder={language.t("settings.customProvider.modelName.placeholder")}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    props.onCustomChange((current) => ({
                      ...current,
                      models: current.models.map((item, itemIndex) => (itemIndex === index ? { ...item, name: value } : item)),
                    }))
                  }}
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
                  <span>Image</span>
                </label>
                <button
                  type="button"
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
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="settings-dialog-secondary"
              onClick={() =>
                props.onCustomChange((current) => ({ ...current, models: [...current.models, { id: "", name: "", supportsImage: false }] }))
              }
            >
              {language.t("settings.customProvider.addModel")}
            </button>
          </div>
        </div>
        <div className="settings-dialog-footer">
          {props.onDelete ? (
            <button type="button" disabled={props.savingCustom} onClick={props.onDelete}>
              {language.t("settings.customProvider.delete")}
            </button>
          ) : null}
          <button type="button" disabled={props.savingCustom} onClick={props.onClose}>
            {language.t("common.cancel")}
          </button>
          <button type="button" disabled={props.savingCustom} onClick={props.onSave}>
            {props.savingCustom ? language.t("common.saving") : language.t("settings.customProvider.save")}
          </button>
        </div>
      </div>
    </div>
  )
}
