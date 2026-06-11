import { useCallback, useEffect, useState } from "react"
import { MagicWand, Plugs, Robot, Scroll, SlidersHorizontal, Translate } from "@phosphor-icons/react"
import { useLanguage } from "../../context/language"
import { useSession } from "../../context/session"
import { SettingsActions } from "./settings-actions"
import { SettingsAgents } from "./settings-agents"
import { SettingsAutocomplete } from "./settings-autocomplete"
import { SettingsRules } from "./settings-rules"
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
  const [tab, setTab] = useState<"models" | "agents" | "rules" | "providers" | "language" | "autocomplete">("models")
  const [draftPluginLanguageMode, setDraftPluginLanguageMode] = useState(session.state.pluginLanguageMode ?? "auto")
  const [draftSelectedModel, setDraftSelectedModel] = useState<ModelSelection | undefined>(session.state.defaultModel)
  const [draftModeModels, setDraftModeModels] = useState<Partial<Record<string, ModelSelection>>>(session.state.modeModels ?? {})
  const [agentDirty, setAgentDirty] = useState(false)
  const [agentSave, setAgentSave] = useState<(() => void) | undefined>()
  const [agentResetToken, setAgentResetToken] = useState(0)
  const handleAgentSave = useCallback((next: (() => void) | undefined) => setAgentSave(() => next), [])

  useEffect(() => {
    setDraftSelectedModel(session.state.defaultModel)
    setDraftModeModels(session.state.modeModels ?? {})
    setDraftPluginLanguageMode(session.state.pluginLanguageMode ?? "auto")
  }, [session.state.defaultModel, session.state.modeModels, session.state.pluginLanguageMode])

  const connectedModels = session.state.models.filter((model) => model.connected)
  const modeAgents = session.state.agents.filter((agent) => agent.mode !== "subagent" && !agent.hidden)
  const modes = modeAgents.map((agent) => agent.name)
  const dirty =
    !sameModel(draftSelectedModel, session.state.defaultModel) ||
    modes.some((mode) => !sameModel(draftModeModels[mode], session.state.modeModels?.[mode])) ||
    draftPluginLanguageMode !== (session.state.pluginLanguageMode ?? "auto") ||
    agentDirty

  const discard = () => {
    setDraftSelectedModel(session.state.defaultModel)
    setDraftModeModels(session.state.modeModels ?? {})
    setDraftPluginLanguageMode(session.state.pluginLanguageMode ?? "auto")
    setAgentDirty(false)
    setAgentResetToken((token) => token + 1)
  }

  const save = () => {
    if (draftSelectedModel && !sameModel(draftSelectedModel, session.state.defaultModel)) session.setModel(draftSelectedModel)
    modes
      .filter((mode) => !sameModel(draftModeModels[mode], session.state.modeModels?.[mode]))
      .forEach((mode) => session.setModeModel(mode, draftModeModels[mode]))
    if (draftPluginLanguageMode !== (session.state.pluginLanguageMode ?? "auto")) session.setPluginLanguage(draftPluginLanguageMode)
    if (agentDirty) agentSave?.()
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
          <button type="button" className={`settings-nav-item ${tab === "providers" ? "active" : ""}`} onClick={() => setTab("providers")}>
            <span className="settings-nav-icon">
              <Plugs size={16} weight="bold" />
            </span>
            <span>{language.t("settings.nav.providers")}</span>
          </button>
          <button type="button" className={`settings-nav-item ${tab === "models" ? "active" : ""}`} onClick={() => setTab("models")}>
            <span className="settings-nav-icon">
              <SlidersHorizontal size={16} weight="bold" />
            </span>
            <span>{language.t("settings.nav.models")}</span>
          </button>
          <button type="button" className={`settings-nav-item ${tab === "agents" ? "active" : ""}`} onClick={() => setTab("agents")}>
            <span className="settings-nav-icon">
              <Robot size={16} weight="bold" />
            </span>
            <span>{language.t("settings.nav.agents")}</span>
          </button>
          <button type="button" className={`settings-nav-item ${tab === "rules" ? "active" : ""}`} onClick={() => setTab("rules")}>
            <span className="settings-nav-icon">
              <Scroll size={16} weight="bold" />
            </span>
            <span>{language.t("settings.nav.rules")}</span>
          </button>
          <button type="button" className={`settings-nav-item ${tab === "language" ? "active" : ""}`} onClick={() => setTab("language")}>
            <span className="settings-nav-icon">
              <Translate size={16} weight="bold" />
            </span>
            <span>{language.t("settings.nav.language")}</span>
          </button>
          <button type="button" className={`settings-nav-item ${tab === "autocomplete" ? "active" : ""}`} onClick={() => setTab("autocomplete")}>
            <span className="settings-nav-icon">
              <MagicWand size={16} weight="bold" />
            </span>
            <span>{language.t("settings.nav.autocomplete")}</span>
          </button>
        </nav>

        <div className="settings-content">
          {tab === "models" ? (
            <SettingsModels
              agents={modeAgents}
              connectedModels={connectedModels}
              selectedModel={draftSelectedModel}
              modeModels={draftModeModels}
              onSelectedModelChange={setDraftSelectedModel}
              onModeModelChange={(mode, model) => setDraftModeModels((current) => ({ ...current, [mode]: model }))}
              onModeModelClear={(mode) => setDraftModeModels((current) => ({ ...current, [mode]: undefined }))}
            />
          ) : tab === "agents" ? (
            <SettingsAgents
              agents={session.state.agents}
              connectedModels={connectedModels}
              resetToken={agentResetToken}
              onDirtyChange={setAgentDirty}
              onSave={handleAgentSave}
              onConfigureAgent={session.configureAgent}
              onDeleteAgent={session.deleteAgent}
            />
          ) : tab === "language" ? (
            <SettingsLanguage pluginLanguageMode={draftPluginLanguageMode} onPluginLanguageChange={setDraftPluginLanguageMode} />
          ) : tab === "autocomplete" ? (
            <SettingsAutocomplete
              enabled={session.state.autocompleteEnabled ?? true}
              onEnabledChange={session.setAutocompleteEnabled}
            />
          ) : tab === "rules" ? (
            <SettingsRules
              rules={session.state.rules ?? []}
              onSaveRule={session.saveRule}
              onToggleRule={session.toggleRule}
              onDeleteRule={session.deleteRule}
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
