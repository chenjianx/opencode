import { useLanguage } from "../../context/language"
import { SettingsRow } from "./settings-common"

export function SettingsAutocomplete(props: {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
}) {
  const language = useLanguage()

  return (
    <>
      <h3>{language.t("settings.autocomplete.title")}</h3>
      <div className="settings-card settings-model-card">
        <SettingsRow
          title={language.t("settings.autocomplete.enable.title")}
          description={language.t("settings.autocomplete.enable.description")}
        >
          <input
            type="checkbox"
            role="switch"
            className="settings-toggle"
            checked={props.enabled}
            aria-label={language.t("settings.autocomplete.enable.title")}
            onChange={(event) => props.onEnabledChange(event.currentTarget.checked)}
          />
        </SettingsRow>
      </div>
    </>
  )
}
