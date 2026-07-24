import { memo, useEffect, useState } from "react"
import {
  Cloud,
  FileText,
  MagicWand,
  Plugs,
  Robot,
  Scroll,
  SlidersHorizontal,
  TerminalWindow,
  Translate,
} from "@phosphor-icons/react"
import { useLanguage } from "../../context/language"
import { useSessionActions, useSessionConfig } from "../../context/session"
import { SettingsActions } from "./settings-actions"
import { SettingsAgents } from "./settings-agents"
import { SettingsAutocomplete } from "./settings-autocomplete"
import { SettingsCommands } from "./settings-commands"
import { SettingsRules } from "./settings-rules"
import { SettingsLanguage } from "./settings-language"
import { SettingsMcp } from "./settings-mcp"
import { SettingsModels } from "./settings-models"
import { SettingsProviders } from "./settings-providers"
import { SettingsSkills } from "./settings-skills"

type ModelSelection = { providerID: string; modelID: string }

function sameModel(a: ModelSelection | undefined, b: ModelSelection | undefined) {
  return a?.providerID === b?.providerID && a?.modelID === b?.modelID
}

export const SettingsView = memo(function SettingsView(props: { onClose?: () => void }) {
  const language = useLanguage()
  const config = useSessionConfig()
  const actions = useSessionActions()
  const [tab, setTab] = useState<
    "models" | "agents" | "commands" | "rules" | "providers" | "mcp" | "skills" | "language" | "autocomplete"
  >("providers")
  const [draftPluginLanguageMode, setDraftPluginLanguageMode] = useState(config.pluginLanguageMode ?? "auto")
  const [draftSelectedModel, setDraftSelectedModel] = useState<ModelSelection | undefined>(config.defaultModel)
  const [draftModeModels, setDraftModeModels] = useState<Partial<Record<string, ModelSelection>>>(
    config.modeModels ?? {},
  )
  const [draftAutocompleteEnabled, setDraftAutocompleteEnabled] = useState(config.autocompleteEnabled ?? true)
  const [saveState, setSaveState] = useState<{ status: "idle" | "saving" | "error" | "success"; error?: string }>({
    status: "idle",
  })

  useEffect(() => {
    if (saveState.status === "saving" || saveState.status === "error") return
    setDraftSelectedModel(config.defaultModel)
    setDraftModeModels(config.modeModels ?? {})
    setDraftPluginLanguageMode(config.pluginLanguageMode ?? "auto")
    setDraftAutocompleteEnabled(config.autocompleteEnabled ?? true)
  }, [config.autocompleteEnabled, config.defaultModel, config.modeModels, config.pluginLanguageMode, saveState.status])

  useEffect(() => {
    if (saveState.status !== "success") return
    const timeout = window.setTimeout(() => setSaveState({ status: "idle" }), 2000)
    return () => window.clearTimeout(timeout)
  }, [saveState.status])

  const connectedModels = config.models.filter((model) => model.connected)
  const modeAgents = config.agents.filter((agent) => agent.mode !== "subagent" && !agent.hidden)
  const modes = modeAgents.map((agent) => agent.name)
  const dirty =
    !sameModel(draftSelectedModel, config.defaultModel) ||
    modes.some((mode) => !sameModel(draftModeModels[mode], config.modeModels?.[mode])) ||
    draftPluginLanguageMode !== (config.pluginLanguageMode ?? "auto") ||
    draftAutocompleteEnabled !== (config.autocompleteEnabled ?? true)

  const discard = () => {
    setDraftSelectedModel(config.defaultModel)
    setDraftModeModels(config.modeModels ?? {})
    setDraftPluginLanguageMode(config.pluginLanguageMode ?? "auto")
    setDraftAutocompleteEnabled(config.autocompleteEnabled ?? true)
    setSaveState({ status: "idle" })
  }

  const save = async () => {
    if (saveState.status === "saving") return
    setSaveState({ status: "saving" })
    const changedModes = modes.filter((mode) => !sameModel(draftModeModels[mode], config.modeModels?.[mode]))
    const result = await actions.saveSettings({
      ...(!sameModel(draftSelectedModel, config.defaultModel) && draftSelectedModel
        ? { defaultModel: draftSelectedModel }
        : {}),
      ...(changedModes.length
        ? { modeModels: Object.fromEntries(changedModes.map((mode) => [mode, draftModeModels[mode]])) }
        : {}),
      ...(draftPluginLanguageMode !== (config.pluginLanguageMode ?? "auto")
        ? { pluginLanguageMode: draftPluginLanguageMode }
        : {}),
      ...(draftAutocompleteEnabled !== (config.autocompleteEnabled ?? true)
        ? { autocompleteEnabled: draftAutocompleteEnabled }
        : {}),
    })
    setSaveState(result.success ? { status: "success" } : { status: "error", error: result.error })
  }

  return (
    <section className="settings-view">
      <div className="settings-header">
        <div>
          <div className="settings-title">{language.t("settings.title")}</div>
        </div>
        {props.onClose ? (
          <button
            type="button"
            className="min-h-[28px] shrink-0 rounded-[6px] border border-transparent bg-[var(--color-button)] px-[10px] text-[var(--color-foreground)] hover:bg-[var(--color-hover)]"
            onClick={props.onClose}
            aria-label={language.t("common.back")}
          >
            {language.t("common.back")}
          </button>
        ) : null}
      </div>

      <div className="settings-shell">
        <nav className="settings-nav" aria-label={language.t("settings.nav.label")}>
          <button
            type="button"
            className={`settings-nav-item ${tab === "providers" ? "active" : ""}`}
            onClick={() => setTab("providers")}
            title={language.t("settings.nav.providers")}
          >
            <span className="settings-nav-icon">
              <Cloud size={16} weight="bold" />
            </span>
            <span className="settings-nav-label">{language.t("settings.nav.providers")}</span>
          </button>
          <button
            type="button"
            className={`settings-nav-item ${tab === "models" ? "active" : ""}`}
            onClick={() => setTab("models")}
            title={language.t("settings.nav.models")}
          >
            <span className="settings-nav-icon">
              <SlidersHorizontal size={16} weight="bold" />
            </span>
            <span className="settings-nav-label">{language.t("settings.nav.models")}</span>
          </button>
          <button
            type="button"
            className={`settings-nav-item ${tab === "agents" ? "active" : ""}`}
            onClick={() => setTab("agents")}
            title={language.t("settings.nav.agents")}
          >
            <span className="settings-nav-icon">
              <Robot size={16} weight="bold" />
            </span>
            <span className="settings-nav-label">{language.t("settings.nav.agents")}</span>
          </button>
          <button
            type="button"
            className={`settings-nav-item ${tab === "mcp" ? "active" : ""}`}
            onClick={() => setTab("mcp")}
            title={language.t("settings.nav.mcp")}
          >
            <span className="settings-nav-icon">
              <Plugs size={16} weight="bold" />
            </span>
            <span className="settings-nav-label">{language.t("settings.nav.mcp")}</span>
          </button>
          <button
            type="button"
            className={`settings-nav-item ${tab === "skills" ? "active" : ""}`}
            onClick={() => setTab("skills")}
            title={language.t("settings.nav.skills")}
          >
            <span className="settings-nav-icon">
              <FileText size={16} weight="bold" />
            </span>
            <span className="settings-nav-label">{language.t("settings.nav.skills")}</span>
          </button>
          <button
            type="button"
            className={`settings-nav-item ${tab === "commands" ? "active" : ""}`}
            onClick={() => setTab("commands")}
            title={language.t("settings.nav.commands")}
          >
            <span className="settings-nav-icon">
              <TerminalWindow size={16} weight="bold" />
            </span>
            <span className="settings-nav-label">{language.t("settings.nav.commands")}</span>
          </button>
          <button
            type="button"
            className={`settings-nav-item ${tab === "rules" ? "active" : ""}`}
            onClick={() => setTab("rules")}
            title={language.t("settings.nav.rules")}
          >
            <span className="settings-nav-icon">
              <Scroll size={16} weight="bold" />
            </span>
            <span className="settings-nav-label">{language.t("settings.nav.rules")}</span>
          </button>
          <button
            type="button"
            className={`settings-nav-item ${tab === "language" ? "active" : ""}`}
            onClick={() => setTab("language")}
            title={language.t("settings.nav.language")}
          >
            <span className="settings-nav-icon">
              <Translate size={16} weight="bold" />
            </span>
            <span className="settings-nav-label">{language.t("settings.nav.language")}</span>
          </button>
          <button
            type="button"
            className={`settings-nav-item ${tab === "autocomplete" ? "active" : ""}`}
            onClick={() => setTab("autocomplete")}
            title={language.t("settings.nav.autocomplete")}
          >
            <span className="settings-nav-icon">
              <MagicWand size={16} weight="bold" />
            </span>
            <span className="settings-nav-label">{language.t("settings.nav.autocomplete")}</span>
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
              agents={config.agents}
              connectedModels={connectedModels}
              onConfigureAgent={actions.configureAgent}
              onDeleteAgent={actions.deleteAgent}
            />
          ) : tab === "commands" ? (
            <SettingsCommands
              commandConfigs={config.commandConfigs ?? []}
              availableCommands={config.commands ?? []}
              agents={config.agents}
              connectedModels={connectedModels}
              onSaveCommand={actions.saveCommand}
              onDeleteCommand={actions.deleteCommand}
            />
          ) : tab === "language" ? (
            <SettingsLanguage
              pluginLanguageMode={draftPluginLanguageMode}
              onPluginLanguageChange={setDraftPluginLanguageMode}
            />
          ) : tab === "autocomplete" ? (
            <SettingsAutocomplete
              enabled={draftAutocompleteEnabled}
              onEnabledChange={setDraftAutocompleteEnabled}
            />
          ) : tab === "rules" ? (
            <SettingsRules
              rules={config.rules ?? []}
              onSaveRule={actions.saveRule}
              onToggleRule={actions.toggleRule}
              onDeleteRule={actions.deleteRule}
            />
          ) : tab === "mcp" ? (
            <SettingsMcp />
          ) : tab === "skills" ? (
            <SettingsSkills />
          ) : (
            <SettingsProviders />
          )}
        </div>
      </div>

      {dirty || saveState.status !== "idle" ? (
        <SettingsActions
          status={saveState.status === "idle" || (dirty && saveState.status === "success") ? "dirty" : saveState.status}
          error={saveState.error}
          onDiscard={discard}
          onSave={save}
        />
      ) : null}
    </section>
  )
})
