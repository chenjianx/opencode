import { useLanguage } from "../../context/language"
import { Button } from "../ui"

export function SettingsActions(props: {
  status: "dirty" | "saving" | "error" | "success"
  error?: string
  onDiscard: () => void
  onSave: () => void
}) {
  const language = useLanguage()

  const status = props.error ?? language.t(`settings.actions.${props.status}`)

  return (
    <div className="settings-actions">
      <div className={`settings-actions-status ${props.status}`} role="status" aria-live="polite">
        {status}
      </div>
      {props.status !== "success" ? (
        <div className="settings-actions-buttons">
          <Button onClick={props.onDiscard} disabled={props.status === "saving"}>
            {language.t("settings.actions.discard")}
          </Button>
          <Button onClick={props.onSave} disabled={props.status === "saving"}>
            {language.t("settings.actions.save")}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
