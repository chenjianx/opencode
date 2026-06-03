import { Copy, Plus, Trash } from "@phosphor-icons/react"
import { useEffect, useMemo, useState } from "react"
import type {
  RaccoonAgent,
  RaccoonAgentMode,
  RaccoonAgentScope,
  RaccoonModel,
  RaccoonPermissionAction,
  RaccoonPermissionConfig,
  RaccoonPermissionRule,
} from "../../protocol"
import { useLanguage } from "../../context/language"
import { ModelPicker } from "../ui/model-picker"
import { SettingsRow } from "./settings-common"

type ModelSelection = { providerID: string; modelID: string }
type AgentDraft = {
  originalName: string
  scope: RaccoonAgentScope
  name: string
  description: string
  mode: RaccoonAgentMode
  model?: ModelSelection
  temperature: string
  topP: string
  steps: string
  variant: string
  prompt: string
  globalPermission: RaccoonPermissionAction
  permissionRules: RaccoonPermissionRule[]
}

const PERMISSION_NAMES = [
  "read",
  "edit",
  "glob",
  "grep",
  "list",
  "bash",
  "task",
  "skill",
  "lsp",
  "todoread",
  "todowrite",
  "webfetch",
  "websearch",
  "external_directory",
  "question",
  "plan_enter",
  "plan_exit",
]

function label(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

function numericString(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : ""
}

function modelValue(value: RaccoonAgent["model"]) {
  if (!value?.providerID || !value.modelID) return undefined
  return value
}

function modeValue(value: RaccoonAgent["mode"] | undefined): RaccoonAgentMode {
  if (value === "primary" || value === "subagent" || value === "all") return value
  return "subagent"
}

function agentDraft(agent: RaccoonAgent | undefined): AgentDraft {
  const rules = normalizeRules(Array.isArray(agent?.permission) ? agent.permission : [])
  return {
    originalName: agent?.name ?? "custom-agent",
    scope: "project",
    name: agent?.name ?? "custom-agent",
    description: stringValue(agent?.description),
    mode: modeValue(agent?.mode),
    model: modelValue(agent?.model),
    temperature: numericString(agent?.temperature),
    topP: numericString(agent?.topP),
    steps: numericString(agent?.steps),
    variant: stringValue(agent?.variant),
    prompt: stringValue(agent?.prompt),
    globalPermission: rules.find((rule) => rule.permission === "*" && rule.pattern === "*")?.action ?? "allow",
    permissionRules: rules.filter((rule) => !(rule.permission === "*" && rule.pattern === "*")),
  }
}

function newDraft(existing: RaccoonAgent[]): AgentDraft {
  const names = new Set(existing.map((agent) => agent.name))
  const name = Array.from({ length: 100 }, (_, index) => (index === 0 ? "custom-agent" : `custom-agent-${index + 1}`)).find(
    (candidate) => !names.has(candidate),
  )
  return { ...agentDraft(undefined), originalName: name ?? "custom-agent", name: name ?? "custom-agent" }
}

function duplicateDraft(agent: RaccoonAgent, existing: RaccoonAgent[]): AgentDraft {
  const names = new Set(existing.map((item) => item.name))
  const name = Array.from({ length: 100 }, (_, index) => `${agent.name}-copy${index === 0 ? "" : `-${index + 1}`}`).find(
    (candidate) => !names.has(candidate),
  )
  return { ...agentDraft(agent), originalName: name ?? `${agent.name}-copy`, name: name ?? `${agent.name}-copy` }
}

function normalizeRules(rules: RaccoonPermissionRule[]) {
  return Array.from(
    new Map(
      rules
        .filter((rule) => rule.permission && rule.pattern && isPermissionAction(rule.action))
        .map((rule) => [`${rule.permission}::${rule.pattern}`, rule] as const),
    ).values(),
  ).sort((a, b) => a.permission.localeCompare(b.permission) || a.pattern.localeCompare(b.pattern))
}

function isPermissionAction(value: unknown): value is RaccoonPermissionAction {
  return value === "allow" || value === "ask" || value === "deny"
}

function permissionConfig(draft: AgentDraft): RaccoonPermissionConfig {
  const grouped = normalizeRules(draft.permissionRules).reduce<Record<string, Record<string, RaccoonPermissionAction>>>((acc, rule) => {
    return { ...acc, [rule.permission]: { ...(acc[rule.permission] ?? {}), [rule.pattern]: rule.action } }
  }, {})
  return Object.fromEntries([
    ["*", draft.globalPermission],
    ...Object.entries(grouped).map(([name, patterns]) => [
      name,
      Object.keys(patterns).length === 1 && patterns["*"] ? patterns["*"] : patterns,
    ]),
  ]) as RaccoonPermissionConfig
}

function numeric(value: string, min: number, max: number) {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return Math.min(max, Math.max(min, parsed))
}

function draftSnapshot(draft: AgentDraft) {
  return JSON.stringify({
    ...draft,
    temperature: numeric(draft.temperature, 0, 2),
    topP: numeric(draft.topP, 0, 1),
    steps: numeric(draft.steps, 1, 100),
    permissionRules: normalizeRules(draft.permissionRules),
  })
}

export function SettingsAgents(props: {
  agents: RaccoonAgent[]
  connectedModels: RaccoonModel[]
  resetToken: number
  onDirtyChange: (dirty: boolean) => void
  onSave: (save: (() => void) | undefined) => void
  onConfigureAgent: (
    name: string,
    agent: {
      name?: string
      description?: string
      mode?: RaccoonAgentMode
      model?: ModelSelection
      temperature?: number
      topP?: number
      variant?: string
      steps?: number
      prompt?: string
      permission?: RaccoonPermissionConfig
    },
    scope: RaccoonAgentScope,
  ) => void
  onDeleteAgent: (name: string, scope: RaccoonAgentScope) => void
}) {
  const language = useLanguage()
  const agents = props.agents
  const connectedModels = props.connectedModels
  const onDirtyChange = props.onDirtyChange
  const onSave = props.onSave
  const onConfigureAgent = props.onConfigureAgent
  const onDeleteAgent = props.onDeleteAgent
  const [selectedName, setSelectedName] = useState("")
  const selected = useMemo(
    () => agents.find((agent) => agent.name === selectedName) ?? agents[0],
    [agents, selectedName],
  )
  const [draft, setDraft] = useState(() => agentDraft(selected))
  const [baseline, setBaseline] = useState(() => draftSnapshot(draft))
  const [pendingPermission, setPendingPermission] = useState("bash")
  const [pendingPattern, setPendingPattern] = useState("*")
  const [pendingAction, setPendingAction] = useState<RaccoonPermissionAction>("ask")

  useEffect(() => {
    if (selectedName && agents.some((agent) => agent.name === selectedName)) return
    setSelectedName(agents[0]?.name ?? "")
  }, [agents, selectedName])

  useEffect(() => {
    const next = agentDraft(selected)
    setDraft(next)
    setBaseline(draftSnapshot(next))
  }, [props.resetToken, selected])

  const dirty = draftSnapshot(draft) !== baseline
  const invalidName = !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(draft.name.trim())
  const duplicateName = agents.some((agent) => agent.name === draft.name.trim() && agent.name !== draft.originalName)

  useEffect(() => {
    onDirtyChange(dirty)
    onSave(
      dirty && !invalidName && !duplicateName
        ? () =>
            onConfigureAgent(
              draft.originalName,
              {
                name: draft.name.trim(),
                description: draft.description,
                mode: draft.mode,
                model: draft.model,
                temperature: numeric(draft.temperature, 0, 2),
                topP: numeric(draft.topP, 0, 1),
                variant: draft.variant,
                steps: numeric(draft.steps, 1, 100),
                prompt: draft.prompt,
                permission: permissionConfig(draft),
              },
              draft.scope,
            )
        : undefined,
    )
  }, [dirty, draft, duplicateName, invalidName, onConfigureAgent, onDirtyChange, onSave])

  const selectDraft = (next: AgentDraft) => {
    setDraft(next)
    setBaseline(draftSnapshot(next))
    setSelectedName(next.originalName)
  }
  const addRule = () => {
    setDraft((current) => ({
      ...current,
      permissionRules: normalizeRules([
        ...current.permissionRules,
        { permission: pendingPermission.trim(), pattern: pendingPattern.trim() || "*", action: pendingAction },
      ]),
    }))
  }
  const setRuleAction = (permission: string, pattern: string, action: RaccoonPermissionAction) => {
    setDraft((current) => ({
      ...current,
      permissionRules: current.permissionRules.map((rule) =>
        rule.permission === permission && rule.pattern === pattern ? { ...rule, action } : rule,
      ),
    }))
  }
  const removeRule = (permission: string, pattern: string) => {
    setDraft((current) => ({
      ...current,
      permissionRules: current.permissionRules.filter((rule) => rule.permission !== permission || rule.pattern !== pattern),
    }))
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="m-0">{language.t("settings.agents.title")}</h3>
        <button type="button" className="settings-small-button" onClick={() => selectDraft(newDraft(agents))}>
          <Plus size={14} weight="bold" />
          <span>{language.t("settings.agents.new")}</span>
        </button>
      </div>
      <div className="settings-agent-shell">
        <div className="settings-card settings-agent-list">
          {agents.length === 0 ? (
            <div className="px-3 py-4 text-[12px] text-[var(--color-muted)]">{language.t("settings.agents.empty")}</div>
          ) : (
            agents.map((agent) => (
              <button
                type="button"
                key={agent.name}
                className={`settings-agent-list-item ${agent.name === selected?.name ? "active" : ""}`}
                onClick={() => setSelectedName(agent.name)}
              >
                <span className="settings-agent-list-main">
                  <span className="settings-agent-list-name">{label(agent.name)}</span>
                  <span className="settings-agent-list-description">{agent.description || agent.name}</span>
                </span>
                <span className="settings-agent-list-tags">
                  <span>{agent.mode}</span>
                  {agent.native ? <span>{language.t("settings.agents.native")}</span> : null}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="settings-card settings-model-card settings-agent-panel">
          <div className="settings-agent-panel-header">
            <div className="settings-agent-panel-title">
              <div className="settings-agent-panel-name">{draft.name}</div>
              <div className="settings-agent-panel-subtitle">{language.t("settings.agents.configureSubtitle")}</div>
            </div>
            <div className="settings-agent-panel-actions">
              {selected ? (
                <button type="button" className="settings-icon-button" title={language.t("settings.agents.duplicate")} onClick={() => selectDraft(duplicateDraft(selected, agents))}>
                  <Copy size={14} weight="bold" />
                </button>
              ) : null}
              <button
                type="button"
                className="settings-icon-button"
                title={selected?.native ? language.t("settings.agents.reset") : language.t("settings.agents.delete")}
                onClick={() => onDeleteAgent(draft.originalName, draft.scope)}
              >
                <Trash size={14} weight="bold" />
              </button>
            </div>
          </div>

          <div className="settings-agent-section-title">{language.t("settings.agents.identity")}</div>
          <SettingsRow title={language.t("settings.agents.name.title")} description={language.t("settings.agents.name.description")}>
            <div className="flex w-full flex-col gap-1">
              <input
                className="settings-provider-input w-full"
                value={draft.name}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setDraft((current) => ({ ...current, name: value }))
                }}
                placeholder="custom-agent"
              />
              {invalidName || duplicateName ? (
                <div className="text-[11px] text-[var(--color-error)]">
                  {invalidName ? language.t("settings.agents.error.name") : language.t("settings.agents.error.duplicate")}
                </div>
              ) : null}
            </div>
          </SettingsRow>
          <SettingsRow title={language.t("settings.agents.scope.title")} description={language.t("settings.agents.scope.description")}>
            <select
              className="settings-select"
              value={draft.scope}
              onChange={(event) => {
                const value = event.currentTarget.value as RaccoonAgentScope
                setDraft((current) => ({ ...current, scope: value }))
              }}
            >
              <option value="project">{language.t("settings.agents.scope.project")}</option>
              <option value="user">{language.t("settings.agents.scope.user")}</option>
            </select>
          </SettingsRow>
          <div className="settings-agent-section-title">{language.t("settings.agents.behavior")}</div>
          <SettingsRow title={language.t("settings.agents.description.title")} description={language.t("settings.agents.description.description")}>
            <input
              className="settings-provider-input w-full"
              value={draft.description}
              onChange={(event) => {
                const value = event.currentTarget.value
                setDraft((current) => ({ ...current, description: value }))
              }}
              placeholder={language.t("settings.agents.description.placeholder")}
            />
          </SettingsRow>
          <SettingsRow title={language.t("settings.agents.mode.title")} description={language.t("settings.agents.mode.description")}>
            <select
              className="settings-select"
              value={draft.mode}
              onChange={(event) => {
                const value = event.currentTarget.value as RaccoonAgentMode
                setDraft((current) => ({ ...current, mode: value }))
              }}
            >
              <option value="primary">{language.t("settings.agents.mode.primary")}</option>
              <option value="subagent">{language.t("settings.agents.mode.subagent")}</option>
              <option value="all">{language.t("settings.agents.mode.all")}</option>
            </select>
          </SettingsRow>
          <SettingsRow title={language.t("settings.agents.model.title")} description={language.t("settings.agents.model.description")}>
            <ModelPicker
              value={draft.model}
              models={connectedModels}
              onChange={(model) => setDraft((current) => ({ ...current, model }))}
              ariaLabel={language.t("settings.agents.model.title")}
              placeholder={language.t("settings.models.noModel")}
              compact
              placement="bottom"
              maxWidth={255}
            />
          </SettingsRow>
          <SettingsRow title={language.t("settings.agents.parameters.title")} description={language.t("settings.agents.parameters.description")}>
            <div className="grid w-full grid-cols-3 gap-2 max-[520px]:grid-cols-1">
              <input
                className="settings-provider-input"
                value={draft.temperature}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setDraft((current) => ({ ...current, temperature: value }))
                }}
                placeholder="temperature"
              />
              <input
                className="settings-provider-input"
                value={draft.topP}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setDraft((current) => ({ ...current, topP: value }))
                }}
                placeholder="top_p"
              />
              <input
                className="settings-provider-input"
                value={draft.steps}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setDraft((current) => ({ ...current, steps: value }))
                }}
                placeholder="steps"
              />
            </div>
          </SettingsRow>
          <div className="settings-agent-section-title">{language.t("settings.agents.instructions")}</div>
          <SettingsRow title={language.t("settings.agents.prompt.title")} description={language.t("settings.agents.prompt.description")}>
            <textarea
              className="min-h-[160px] w-full rounded-[4px] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1.5 text-[12px] leading-4 text-[var(--color-input-foreground)] outline-none focus:border-[var(--color-focus)]"
              value={draft.prompt}
              onChange={(event) => {
                const value = event.currentTarget.value
                setDraft((current) => ({ ...current, prompt: value }))
              }}
              placeholder={language.t("settings.agents.prompt.placeholder")}
            />
          </SettingsRow>

          <div className="border-t border-[var(--color-border)] px-3 py-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[12px] font-medium text-[var(--color-foreground)]">{language.t("settings.agents.permissions.title")}</div>
                <div className="text-[11px] text-[var(--color-muted)]">{language.t("settings.agents.permissions.description")}</div>
              </div>
              <select
                className="settings-select"
                value={draft.globalPermission}
                onChange={(event) => {
                  const value = event.currentTarget.value as RaccoonPermissionAction
                  setDraft((current) => ({ ...current, globalPermission: value }))
                }}
              >
                <option value="allow">{language.t("settings.agents.permission.allow")}</option>
                <option value="ask">{language.t("settings.agents.permission.ask")}</option>
                <option value="deny">{language.t("settings.agents.permission.deny")}</option>
              </select>
            </div>
            <div className="grid grid-cols-[minmax(100px,1fr)_minmax(110px,1fr)_96px_32px] gap-2 max-[620px]:grid-cols-1">
              <select
                className="settings-select"
                value={pendingPermission}
                onChange={(event) => setPendingPermission(event.currentTarget.value)}
              >
                {PERMISSION_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <input
                className="settings-provider-input"
                value={pendingPattern}
                onChange={(event) => setPendingPattern(event.currentTarget.value)}
                placeholder="*"
              />
              <select
                className="settings-select min-w-0"
                value={pendingAction}
                onChange={(event) => setPendingAction(event.currentTarget.value as RaccoonPermissionAction)}
              >
                <option value="allow">{language.t("settings.agents.permission.allow")}</option>
                <option value="ask">{language.t("settings.agents.permission.ask")}</option>
                <option value="deny">{language.t("settings.agents.permission.deny")}</option>
              </select>
              <button type="button" className="settings-icon-button" title={language.t("settings.agents.permissions.add")} onClick={addRule}>
                <Plus size={14} weight="bold" />
              </button>
            </div>
            <div className="mt-2 overflow-hidden rounded-[4px] border border-[var(--color-border)]">
              {draft.permissionRules.length === 0 ? (
                <div className="px-2 py-2 text-[11px] text-[var(--color-muted)]">{language.t("settings.agents.permissions.empty")}</div>
              ) : (
                normalizeRules(draft.permissionRules).map((rule) => (
                  <div key={`${rule.permission}:${rule.pattern}`} className="grid grid-cols-[1fr_1fr_96px_32px] items-center gap-2 border-b border-[var(--color-border)] px-2 py-1.5 last:border-b-0 max-[620px]:grid-cols-1">
                    <div className="truncate text-[12px] text-[var(--color-foreground)]">{rule.permission}</div>
                    <div className="truncate text-[12px] text-[var(--color-muted)]">{rule.pattern}</div>
                    <select
                      className="settings-select min-w-0"
                      value={rule.action}
                      onChange={(event) => setRuleAction(rule.permission, rule.pattern, event.currentTarget.value as RaccoonPermissionAction)}
                    >
                      <option value="allow">{language.t("settings.agents.permission.allow")}</option>
                      <option value="ask">{language.t("settings.agents.permission.ask")}</option>
                      <option value="deny">{language.t("settings.agents.permission.deny")}</option>
                    </select>
                    <button type="button" className="settings-icon-button" title={language.t("settings.agents.permissions.remove")} onClick={() => removeRule(rule.permission, rule.pattern)}>
                      <Trash size={14} weight="bold" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
