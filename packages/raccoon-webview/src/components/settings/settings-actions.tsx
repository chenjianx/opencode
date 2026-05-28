import { useLanguage } from "../../context/language"

export function SettingsActions(props: { dirty: boolean; onDiscard: () => void; onSave: () => void }) {
  const language = useLanguage()

  return (
    <div className="settings-actions">
      <div className={`settings-actions-status ${props.dirty ? "dirty" : ""}`}>
        {props.dirty ? language.t("settings.actions.unsaved") : language.t("settings.actions.clean")}
      </div>
      <div className="settings-actions-buttons">
        <button type="button" disabled={!props.dirty} onClick={props.onDiscard}>
          {language.t("settings.actions.discard")}
        </button>
        <button type="button" disabled={!props.dirty} onClick={props.onSave}>
          {language.t("settings.actions.save")}
        </button>
      </div>
    </div>
  )
}
