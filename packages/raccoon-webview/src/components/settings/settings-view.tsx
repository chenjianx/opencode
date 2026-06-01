import { useEffect, useState } from "react"
import { Plugs, SlidersHorizontal, Translate } from "@phosphor-icons/react"
import type { ChatMode } from "../../protocol"
import { useLanguage } from "../../context/language"
import { useSession } from "../../context/session"
import { SettingsActions } from "./settings-actions"
import { SettingsLanguage } from "./settings-language"
import { SettingsModels } from "./settings-models"
import { SettingsProviders } from "./settings-providers"

type ModelSelection = { providerID: string; modelID: string }

function sameModel(a: ModelSelection | undefined, b: ModelSelection | undefined) {
  return a?.providerID === b?.providerID && a?.modelID === b?.modelID
}

export function SettingsView() {
  const language = useLanguage()
  const session = useSession()
  const [tab, setTab] = useState<"models" | "providers" | "language">("models")
  const [draftPluginLanguageMode, setDraftPluginLanguageMode] = useState(session.state.pluginLanguageMode ?? "auto")
  const [draftSelectedModel, setDraftSelectedModel] = useState<ModelSelection | undefined>(session.state.selectedModel)
  const [draftModeModels, setDraftModeModels] = useState<Partial<Record<ChatMode, ModelSelection>>>(session.state.modeModels ?? {})

  useEffect(() => {
    setDraftSelectedModel(session.state.selectedModel)
    setDraftModeModels(session.state.modeModels ?? {})
    setDraftPluginLanguageMode(session.state.pluginLanguageMode ?? "auto")
  }, [session.state.selectedModel, session.state.modeModels, session.state.pluginLanguageMode])

  const connectedModels = session.state.models.filter((model) => model.connected)
  const dirty =
    !sameModel(draftSelectedModel, session.state.selectedModel) ||
    !sameModel(draftModeModels.build, session.state.modeModels?.build) ||
    !sameModel(draftModeModels.plan, session.state.modeModels?.plan) ||
    draftPluginLanguageMode !== (session.state.pluginLanguageMode ?? "auto")

  const discard = () => {
    setDraftSelectedModel(session.state.selectedModel)
    setDraftModeModels(session.state.modeModels ?? {})
    setDraftPluginLanguageMode(session.state.pluginLanguageMode ?? "auto")
  }

  const save = () => {
    if (draftSelectedModel && !sameModel(draftSelectedModel, session.state.selectedModel)) session.setModel(draftSelectedModel)
    if (draftModeModels.build && !sameModel(draftModeModels.build, session.state.modeModels?.build)) {
      session.setModeModel("build", draftModeModels.build)
    }
    if (draftModeModels.plan && !sameModel(draftModeModels.plan, session.state.modeModels?.plan)) {
      session.setModeModel("plan", draftModeModels.plan)
    }
    if (draftPluginLanguageMode !== (session.state.pluginLanguageMode ?? "auto")) session.setPluginLanguage(draftPluginLanguageMode)
  }

  return (
    <section className="settings-view">
      <div className="settings-header">
        <div>
          <div className="settings-title">{language.t("settings.title")}</div>
          <div className="settings-subtitle">{language.t("settings.subtitle")}</div>
        </div>
      </div>

      <div className="settings-shell">
        <nav className="settings-nav" aria-label={language.t("settings.nav.label")}>
          <button type="button" className={`settings-nav-item ${tab === "models" ? "active" : ""}`} onClick={() => setTab("models")}>
            <span className="settings-nav-icon">
              <SlidersHorizontal size={16} weight="bold" />
            </span>
            <span>{language.t("settings.nav.models")}</span>
          </button>
          <button type="button" className={`settings-nav-item ${tab === "providers" ? "active" : ""}`} onClick={() => setTab("providers")}>
            <span className="settings-nav-icon">
              <Plugs size={16} weight="bold" />
            </span>
            <span>{language.t("settings.nav.providers")}</span>
          </button>
          <button type="button" className={`settings-nav-item ${tab === "language" ? "active" : ""}`} onClick={() => setTab("language")}>
            <span className="settings-nav-icon">
              <Translate size={16} weight="bold" />
            </span>
            <span>{language.t("settings.nav.language")}</span>
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
          ) : tab === "language" ? (
            <SettingsLanguage pluginLanguageMode={draftPluginLanguageMode} onPluginLanguageChange={setDraftPluginLanguageMode} />
          ) : (
            <SettingsProviders />
          )}
        </div>
      </div>

      <SettingsActions dirty={dirty} onDiscard={discard} onSave={save} />
    </section>
  )
}
