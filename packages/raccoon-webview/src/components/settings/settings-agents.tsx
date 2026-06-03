import { ArrowCounterClockwise, Copy, DownloadSimple, Plus, Trash, UploadSimple } from "@phosphor-icons/react"
import { useEffect, useMemo, useRef, useState } from "react"
import type {
  RaccoonAgent,
  RaccoonAgentMode,
  RaccoonAgentScope,
  RaccoonModel,
  RaccoonPermissionConfig,
} from "../../protocol"
import { useLanguage } from "../../context/language"
import { ModelPicker } from "../ui/model-picker"
import { SettingsRow } from "./settings-common"
import { PermissionEditor, PermissionRuleset } from "./permission-editor"
import { mergePermissionPatch, type PermissionPatch } from "./permission-utils"

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
  permission: RaccoonPermissionConfig
  hidden: boolean
}

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

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

function parseModelString(value: unknown): ModelSelection | undefined {
  if (typeof value !== "string") return undefined
  const index = value.indexOf("/")
  if (index <= 0) return undefined
  return { providerID: value.slice(0, index), modelID: value.slice(index + 1) }
}

function agentDraft(agent: RaccoonAgent | undefined): AgentDraft {
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
    permission: agent?.permissionConfig ? { ...agent.permissionConfig } : {},
    hidden: agent?.hidden ?? false,
  }
}

function uniqueName(base: string, existing: RaccoonAgent[]): string {
  const names = new Set(existing.map((agent) => agent.name))
  return (
    Array.from({ length: 100 }, (_, index) => (index === 0 ? base : `${base}-${index + 1}`)).find(
      (candidate) => !names.has(candidate),
    ) ?? base
  )
}

function newDraft(existing: RaccoonAgent[]): AgentDraft {
  const name = uniqueName("custom-agent", existing)
  return { ...agentDraft(undefined), originalName: name, name }
}

function duplicateDraft(agent: RaccoonAgent, existing: RaccoonAgent[]): AgentDraft {
  const name = uniqueName(`${agent.name}-copy`, existing)
  return { ...agentDraft(agent), originalName: name, name }
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
  })
}

function exportPayload(draft: AgentDraft) {
  const payload: Record<string, unknown> = { name: draft.name.trim() }
  if (draft.description.trim()) payload.description = draft.description.trim()
  payload.mode = draft.mode
  if (draft.model) payload.model = `${draft.model.providerID}/${draft.model.modelID}`
  const temperature = numeric(draft.temperature, 0, 2)
  if (temperature !== undefined) payload.temperature = temperature
  const topP = numeric(draft.topP, 0, 1)
  if (topP !== undefined) payload.top_p = topP
  const steps = numeric(draft.steps, 1, 100)
  if (steps !== undefined) payload.steps = steps
  if (draft.variant.trim()) payload.variant = draft.variant.trim()
  if (draft.prompt.trim()) payload.prompt = draft.prompt
  if (Object.keys(draft.permission).length > 0) payload.permission = draft.permission
  if (draft.hidden) payload.hidden = true
  return payload
}

type ImportResult = { ok: true; draft: AgentDraft } | { ok: false; error: "invalidJson" | "invalidName" | "duplicate" }

function draftFromImport(text: string, existing: RaccoonAgent[]): ImportResult {
  let data: Record<string, unknown>
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== "object") return { ok: false, error: "invalidJson" }
    data = parsed as Record<string, unknown>
  } catch {
    return { ok: false, error: "invalidJson" }
  }
  const name = typeof data.name === "string" ? data.name.trim() : ""
  if (!NAME_RE.test(name)) return { ok: false, error: "invalidName" }
  if (existing.some((agent) => agent.name === name)) return { ok: false, error: "duplicate" }
  const draft: AgentDraft = {
    ...agentDraft(undefined),
    originalName: name,
    name,
    description: stringValue(data.description),
    mode: modeValue(data.mode as RaccoonAgentMode | undefined),
    model: parseModelString(data.model),
    temperature: numericString(data.temperature),
    topP: numericString(data.top_p),
    steps: numericString(data.steps),
    variant: stringValue(data.variant),
    prompt: stringValue(data.prompt),
    permission:
      data.permission && typeof data.permission === "object" ? (data.permission as RaccoonPermissionConfig) : {},
    hidden: data.hidden === true,
  }
  return { ok: true, draft }
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
      hidden?: boolean
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
  const [creating, setCreating] = useState(false)
  const [importError, setImportError] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selected = useMemo(
    () => agents.find((agent) => agent.name === selectedName) ?? agents[0],
    [agents, selectedName],
  )
  const [draft, setDraft] = useState(() => agentDraft(selected))
  const [baseline, setBaseline] = useState(() => draftSnapshot(draft))
  const resetTokenRef = useRef(props.resetToken)

  useEffect(() => {
    if (creating) return
    if (selectedName && agents.some((agent) => agent.name === selectedName)) return
    setSelectedName(agents[0]?.name ?? "")
  }, [agents, selectedName, creating])

  useEffect(() => {
    // A Discard (resetToken bump) always cancels an in-progress create and
    // restores the current selection, even while `creating`.
    if (props.resetToken !== resetTokenRef.current) {
      resetTokenRef.current = props.resetToken
      setCreating(false)
      const base = agents.find((agent) => agent.name === selectedName) ?? agents[0]
      const next = agentDraft(base)
      setDraft(next)
      setBaseline(draftSnapshot(next))
      return
    }
    if (creating) return
    const next = agentDraft(selected)
    setDraft(next)
    setBaseline(draftSnapshot(next))
  }, [props.resetToken, selected, creating, agents, selectedName])

  // When a freshly created/duplicated agent has been persisted under its draft
  // name, leave creating mode so the normal selection/reset logic resumes.
  useEffect(() => {
    if (creating && agents.some((agent) => agent.name === selectedName)) setCreating(false)
  }, [agents, creating, selectedName])

  // A brand-new agent does not yet exist on disk, so it is always savable even
  // before the user edits any field.
  const dirty = creating || draftSnapshot(draft) !== baseline
  const invalidName = !NAME_RE.test(draft.name.trim())
  const duplicateName = agents.some((agent) => agent.name === draft.name.trim() && agent.name !== draft.originalName)

  useEffect(() => {
    onDirtyChange(dirty)
    onSave(
      dirty && !invalidName && !duplicateName
        ? () => {
            const savedName = draft.name.trim()
            onConfigureAgent(
              draft.originalName,
              {
                name: savedName,
                description: draft.description,
                mode: draft.mode,
                model: draft.model,
                temperature: numeric(draft.temperature, 0, 2),
                topP: numeric(draft.topP, 0, 1),
                variant: draft.variant,
                steps: numeric(draft.steps, 1, 100),
                prompt: draft.prompt,
                permission: draft.permission,
                hidden: draft.hidden,
              },
              draft.scope,
            )
            // Track the saved name (which may differ from the original when
            // creating or renaming). Keep `creating` set until that name lands
            // in the refreshed agents list so the reset effects don't clobber
            // the panel mid-save; the "clear creating" effect then resyncs.
            setCreating(true)
            setSelectedName(savedName)
          }
        : undefined,
    )
  }, [dirty, draft, duplicateName, invalidName, onConfigureAgent, onDirtyChange, onSave])

  const selectDraft = (next: AgentDraft, isCreating = false) => {
    setCreating(isCreating)
    setDraft(next)
    setBaseline(draftSnapshot(next))
    setSelectedName(next.originalName)
    setImportError("")
  }
  const selectExisting = (name: string) => {
    setCreating(false)
    setSelectedName(name)
    setImportError("")
  }
  const applyPermission = (patch: PermissionPatch) => {
    setDraft((current) => ({ ...current, permission: mergePermissionPatch(current.permission, patch) }))
  }

  const exportAgent = () => {
    const payload = exportPayload(draft)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${draft.name.trim() || "agent"}.agent.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const onImportFile = async (file: File | undefined) => {
    if (!file) return
    const result = draftFromImport(await file.text(), agents)
    if (result.ok) {
      selectDraft(result.draft, true)
    } else {
      setImportError(language.t(`settings.agents.import.${result.error}`))
    }
  }

  // calculated ruleset only meaningful for an already-resolved (saved) agent
  const editingRules = creating ? undefined : selected?.permission

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="m-0">{language.t("settings.agents.title")}</h3>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              void onImportFile(event.currentTarget.files?.[0])
              event.currentTarget.value = ""
            }}
          />
          <button type="button" className="settings-small-button" title={language.t("settings.agents.import")} onClick={() => fileInputRef.current?.click()}>
            <UploadSimple size={14} weight="bold" />
            <span>{language.t("settings.agents.import")}</span>
          </button>
          <button type="button" className="settings-small-button" onClick={() => selectDraft(newDraft(agents), true)}>
            <Plus size={14} weight="bold" />
            <span>{language.t("settings.agents.new")}</span>
          </button>
        </div>
      </div>
      {importError ? <div className="mb-2 text-[11px] text-[var(--color-error)]">{importError}</div> : null}
      <div className="settings-agent-shell">
        <div className="settings-card settings-agent-list">
          {agents.length === 0 ? (
            <div className="px-3 py-4 text-[12px] text-[var(--color-muted)]">{language.t("settings.agents.empty")}</div>
          ) : (
            agents.map((agent) => (
              <button
                type="button"
                key={agent.name}
                className={`settings-agent-list-item ${!creating && agent.name === selected?.name ? "active" : ""}`}
                onClick={() => selectExisting(agent.name)}
              >
                <span className="settings-agent-list-main">
                  <span className="settings-agent-list-name">{label(agent.name)}</span>
                  <span className="settings-agent-list-description">{agent.description || agent.name}</span>
                </span>
                <span className="settings-agent-list-tags">
                  <span>{agent.mode}</span>
                  {agent.hidden ? <span>{language.t("settings.agents.hidden.title")}</span> : null}
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
              {selected && !creating ? (
                <button type="button" className="settings-small-button" title={language.t("settings.agents.duplicate")} onClick={() => selectDraft(duplicateDraft(selected, agents), true)}>
                  <Copy size={14} weight="bold" />
                  <span>{language.t("settings.agents.action.duplicate")}</span>
                </button>
              ) : null}
              <button type="button" className="settings-small-button" title={language.t("settings.agents.export")} onClick={exportAgent}>
                <DownloadSimple size={14} weight="bold" />
                <span>{language.t("settings.agents.export")}</span>
              </button>
              {selected && !creating ? (
                <button
                  type="button"
                  className="settings-small-button"
                  title={selected.native ? language.t("settings.agents.reset") : language.t("settings.agents.delete")}
                  onClick={() => onDeleteAgent(selected.name, draft.scope)}
                >
                  {selected.native ? <ArrowCounterClockwise size={14} weight="bold" /> : <Trash size={14} weight="bold" />}
                  <span>{selected.native ? language.t("settings.agents.action.reset") : language.t("settings.agents.action.delete")}</span>
                </button>
              ) : null}
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
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--color-muted)]">temperature</span>
                <input
                  className="settings-provider-input"
                  value={draft.temperature}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    setDraft((current) => ({ ...current, temperature: value }))
                  }}
                  placeholder="0 – 2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--color-muted)]">top_p</span>
                <input
                  className="settings-provider-input"
                  value={draft.topP}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    setDraft((current) => ({ ...current, topP: value }))
                  }}
                  placeholder="0 – 1"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--color-muted)]">steps</span>
                <input
                  className="settings-provider-input"
                  value={draft.steps}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    setDraft((current) => ({ ...current, steps: value }))
                  }}
                  placeholder="1 – 100"
                />
              </label>
            </div>
          </SettingsRow>
          <SettingsRow title={language.t("settings.agents.hidden.title")} description={language.t("settings.agents.hidden.description")}>
            <input
              type="checkbox"
              role="switch"
              className="settings-toggle"
              checked={draft.hidden}
              onChange={(event) => {
                const value = event.currentTarget.checked
                setDraft((current) => ({ ...current, hidden: value }))
              }}
            />
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

          <div className="settings-agent-section-title">{language.t("settings.agents.permissions.title")}</div>
          <PermissionEditor permission={draft.permission} rules={editingRules} inherited onChange={applyPermission} />
          {editingRules && editingRules.length > 0 ? <PermissionRuleset agent={draft.name} rules={editingRules} /> : null}
        </div>
      </div>
    </>
  )
}
