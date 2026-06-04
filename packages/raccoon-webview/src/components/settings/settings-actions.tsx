import { useLanguage } from "../../context/language"

export function SettingsActions(props: { dirty: boolean; onDiscard: () => void; onSave: () => void }) {
  const language = useLanguage()

  if (!props.dirty) return null

  return (
    <div className="settings-actions">
      <div className="settings-actions-status dirty">{language.t("settings.actions.unsaved")}</div>
      <div className="settings-actions-buttons">
        <button type="button" onClick={props.onDiscard}>
          {language.t("settings.actions.discard")}
        </button>
        <button type="button" onClick={props.onSave}>
          {language.t("settings.actions.save")}
        </button>
      </div>
    </div>
  )
}
