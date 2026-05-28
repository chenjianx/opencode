import { useEffect, useState } from "react"
import type { ChatMode } from "../../protocol"
import { useLanguage } from "../../context/language"
import { useSession } from "../../context/session"
import { SettingsActions } from "./settings-actions"
import { SettingsModels } from "./settings-models"
import { SettingsProviders } from "./settings-providers"

type ModelSelection = { providerID: string; modelID: string }

function sameModel(a: ModelSelection | undefined, b: ModelSelection | undefined) {
  return a?.providerID === b?.providerID && a?.modelID === b?.modelID
}

export function SettingsView(props: { onClose: () => void }) {
  const language = useLanguage()
  const session = useSession()
  const [tab, setTab] = useState<"models" | "providers">("models")
  const [draftSelectedModel, setDraftSelectedModel] = useState<ModelSelection | undefined>(session.state.selectedModel)
  const [draftModeModels, setDraftModeModels] = useState<Partial<Record<ChatMode, ModelSelection>>>(session.state.modeModels ?? {})

  useEffect(() => {
    setDraftSelectedModel(session.state.selectedModel)
    setDraftModeModels(session.state.modeModels ?? {})
  }, [session.state.selectedModel, session.state.modeModels])

  const connectedModels = session.state.models.filter((model) => model.connected)
  const dirty =
    !sameModel(draftSelectedModel, session.state.selectedModel) ||
    !sameModel(draftModeModels.build, session.state.modeModels?.build) ||
    !sameModel(draftModeModels.plan, session.state.modeModels?.plan)

  const discard = () => {
    setDraftSelectedModel(session.state.selectedModel)
    setDraftModeModels(session.state.modeModels ?? {})
  }

  const save = () => {
    if (draftSelectedModel && !sameModel(draftSelectedModel, session.state.selectedModel)) session.setModel(draftSelectedModel)
    if (draftModeModels.build && !sameModel(draftModeModels.build, session.state.modeModels?.build)) {
      session.setModeModel("build", draftModeModels.build)
    }
    if (draftModeModels.plan && !sameModel(draftModeModels.plan, session.state.modeModels?.plan)) {
      session.setModeModel("plan", draftModeModels.plan)
    }
  }

  return (
    <section className="settings-view">
      <div className="settings-header">
        <div>
          <div className="settings-title">{language.t("settings.title")}</div>
          <div className="settings-subtitle">{language.t("settings.subtitle")}</div>
        </div>
        <button type="button" onClick={props.onClose} aria-label={language.t("settings.backToChat")}>
          {language.t("common.back")}
        </button>
      </div>

      <div className="settings-shell">
        <nav className="settings-nav" aria-label={language.t("settings.nav.label")}>
          <button type="button" className={`settings-nav-item ${tab === "models" ? "active" : ""}`} onClick={() => setTab("models")}>
            <span className="settings-nav-icon">◧</span>
            <span>{language.t("settings.nav.models")}</span>
          </button>
          <button type="button" className={`settings-nav-item ${tab === "providers" ? "active" : ""}`} onClick={() => setTab("providers")}>
            <span className="settings-nav-icon">⚙</span>
            <span>{language.t("settings.nav.providers")}</span>
          </button>
        </nav>

        <div className="settings-content">
          {tab === "models" ? (
            <SettingsModels
              connectedModels={connectedModels}
              selectedModel={draftSelectedModel}
              modeModels={draftModeModels}
              onSelectedModelChange={setDraftSelectedModel}
              onModeModelChange={(mode, model) => setDraftModeModels((current) => ({ ...current, [mode]: model }))}
            />
          ) : (
            <SettingsProviders />
          )}
        </div>
      </div>

      <SettingsActions dirty={dirty} onDiscard={discard} onSave={save} />
    </section>
  )
}
