import { ArrowCounterClockwise, Copy, DownloadSimple, Plus, Trash, UploadSimple } from "@phosphor-icons/react"
import { useEffect, useMemo, useRef, useState } from "react"
import type {
  RaccoonAgent,
  RaccoonAgentConfigInput,
  RaccoonAgentMode,
  RaccoonAgentScope,
  RaccoonModel,
  RaccoonPermissionConfig,
} from "../../protocol"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import { Button } from "../ui"
import { ModelPicker } from "../ui/model-picker"
import { SettingsRow, Select, TextInput } from "./settings-common"
import { SettingsDialog } from "./settings-dialog"
import { PermissionEditor, PermissionRuleset } from "./permission-editor"
import { mergePermissionPatch, type PermissionPatch } from "./permission-utils"
import { clampParam, downloadJson, formatModelString, NAME_RE, parseModelString, titleCase, uniqueName } from "./utils"

type ModelSelection = { providerID: string; modelID: string }
type AgentIdentity = { name: string; scope: RaccoonAgentScope }
type AgentDraft = {
  original?: AgentIdentity
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
  return {
    original: agent?.configScope ? { name: agent.name, scope: agent.configScope } : undefined,
    scope: agent?.configScope ?? "project",
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

function newDraft(existing: RaccoonAgent[]): AgentDraft {
  const name = uniqueName(
    "custom-agent",
    existing.map((agent) => agent.name),
  )
  return { ...agentDraft(undefined), name }
}

function duplicateDraft(agent: RaccoonAgent, existing: RaccoonAgent[]): AgentDraft {
  const name = uniqueName(
    `${agent.name}-copy`,
    existing.map((item) => item.name),
  )
  return { ...agentDraft(agent), original: undefined, name }
}

function draftSnapshot(draft: AgentDraft) {
  return JSON.stringify({
    ...draft,
    temperature: clampParam(draft.temperature, "temperature"),
    topP: clampParam(draft.topP, "topP"),
    steps: clampParam(draft.steps, "steps"),
  })
}

function exportPayload(draft: AgentDraft) {
  const payload: Record<string, unknown> = { name: draft.name.trim() }
  if (draft.description.trim()) payload.description = draft.description.trim()
  payload.mode = draft.mode
  if (draft.model) payload.model = formatModelString(draft.model)
  const temperature = clampParam(draft.temperature, "temperature")
  if (temperature !== undefined) payload.temperature = temperature
  const topP = clampParam(draft.topP, "topP")
  if (topP !== undefined) payload.top_p = topP
  const steps = clampParam(draft.steps, "steps")
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
  onConfigureAgent: (
    requestID: string,
    original: AgentIdentity | undefined,
    agent: RaccoonAgentConfigInput,
    scope: RaccoonAgentScope,
  ) => void
  onDeleteAgent: (requestID: string, name: string, scope: RaccoonAgentScope) => void
}) {
  const language = useLanguage()
  const vscode = useVSCode()
  const agents = props.agents
  const connectedModels = props.connectedModels
  const onConfigureAgent = props.onConfigureAgent
  const onDeleteAgent = props.onDeleteAgent
  const [selectedName, setSelectedName] = useState("")
  const [creating, setCreating] = useState(false)
  const [editorTab, setEditorTab] = useState<"overview" | "instructions" | "permissions">("overview")
  const [notice, setNotice] = useState("")
  const [savingRequestID, setSavingRequestID] = useState<string>()
  const [saveError, setSaveError] = useState("")
  const [importError, setImportError] = useState<string>("")
  const [pendingDelete, setPendingDelete] = useState<RaccoonAgent>()
  const [deletingRequestID, setDeletingRequestID] = useState<string>()
  const [deleteError, setDeleteError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingDraftRef = useRef<AgentDraft | undefined>(undefined)
  // Built-in (native) agents that are hidden are not surfaced in the list.
  const visibleAgents = useMemo(() => agents.filter((agent) => !(agent.native && agent.hidden)), [agents])
  const selected = useMemo(
    () => agents.find((agent) => agent.name === selectedName) ?? visibleAgents[0],
    [agents, visibleAgents, selectedName],
  )
  const [draft, setDraft] = useState(() => agentDraft(selected))
  const [baseline, setBaseline] = useState(() => draftSnapshot(draft))

  useEffect(() => {
    if (creating || savingRequestID) return
    if (selectedName && agents.some((agent) => agent.name === selectedName)) return
    setSelectedName(visibleAgents[0]?.name ?? "")
  }, [agents, visibleAgents, selectedName, creating, savingRequestID])

  useEffect(() => {
    if (creating || savingRequestID) return
    const next = agentDraft(selected)
    setDraft(next)
    setBaseline(draftSnapshot(next))
  }, [selected, creating, savingRequestID])

  // When a freshly created/duplicated agent has been persisted under its draft
  // name, leave creating mode so the normal selection/reset logic resumes.
  useEffect(() => {
    if (!savingRequestID && creating && agents.some((agent) => agent.name === selectedName)) setCreating(false)
  }, [agents, creating, selectedName, savingRequestID])

  // A brand-new agent does not yet exist on disk, so it is always savable even
  // before the user edits any field.
  const dirty = creating || draftSnapshot(draft) !== baseline
  const invalidName = !NAME_RE.test(draft.name.trim())
  const duplicateName = agents.some(
    (agent) => agent.name === draft.name.trim() && agent.name !== (creating ? undefined : selected?.name),
  )

  useEffect(() => {
    return vscode.onMessage((message) => {
      if (message.type === "agentDeleteResult" && message.requestID === deletingRequestID) {
        setDeletingRequestID(undefined)
        if (!message.success) {
          setDeleteError(message.error ?? language.t("settings.agents.error.delete"))
          return
        }
        setPendingDelete(undefined)
        setDeleteError("")
        return
      }
      if (message.type !== "agentSaveResult" || message.requestID !== savingRequestID) return
      setSavingRequestID(undefined)
      if (!message.success) {
        setSaveError(message.error ?? language.t("settings.agents.error.save"))
        pendingDraftRef.current = undefined
        return
      }
      const pending = pendingDraftRef.current
      if (!pending) return
      const name = message.name ?? pending.name.trim()
      const scope = message.scope ?? pending.scope
      const next = { ...pending, name, scope, original: { name, scope } }
      pendingDraftRef.current = undefined
      setDraft(next)
      setBaseline(draftSnapshot(next))
      setSelectedName(name)
      setCreating(false)
      setNotice("")
      setSaveError("")
    })
  }, [deletingRequestID, language, savingRequestID, vscode])

  const selectDraft = (next: AgentDraft, isCreating = false) => {
    if (dirty || savingRequestID) {
      setNotice(language.t("settings.agents.unsaved.blocked"))
      return
    }
    setCreating(isCreating)
    setDraft(next)
    setBaseline(draftSnapshot(next))
    setSelectedName(next.name)
    setEditorTab("overview")
    setNotice("")
    setSaveError("")
    setImportError("")
  }
  const selectExisting = (name: string) => {
    if (dirty || savingRequestID) {
      setNotice(language.t("settings.agents.unsaved.blocked"))
      return
    }
    setCreating(false)
    setSelectedName(name)
    setEditorTab("overview")
    setNotice("")
    setSaveError("")
    setImportError("")
  }
  const discard = () => {
    const next = agentDraft(selected)
    setCreating(false)
    setDraft(next)
    setBaseline(draftSnapshot(next))
    setSelectedName(selected?.name ?? "")
    setNotice("")
    setSaveError("")
  }
  const save = () => {
    if (!dirty || invalidName || duplicateName || savingRequestID) return
    const savedName = draft.name.trim()
    const requestID = crypto.randomUUID()
    pendingDraftRef.current = { ...draft, name: savedName }
    setSavingRequestID(requestID)
    setSaveError("")
    onConfigureAgent(
      requestID,
      draft.original,
      {
        name: savedName,
        description: draft.description,
        mode: draft.mode,
        model: draft.model,
        temperature: clampParam(draft.temperature, "temperature"),
        topP: clampParam(draft.topP, "topP"),
        variant: draft.variant,
        steps: clampParam(draft.steps, "steps"),
        prompt: draft.prompt,
        permission: draft.permission,
        hidden: draft.hidden,
      },
      draft.scope,
    )
    setNotice("")
  }
  const applyPermission = (patch: PermissionPatch) => {
    setDraft((current) => ({ ...current, permission: mergePermissionPatch(current.permission, patch) }))
  }
  const updateDraft = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) => {
    setSaveError("")
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const exportAgent = () => {
    downloadJson(`${draft.name.trim() || "agent"}.agent.json`, exportPayload(draft))
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
  const confirmDelete = () => {
    if (!pendingDelete || deletingRequestID) return
    const requestID = crypto.randomUUID()
    setDeletingRequestID(requestID)
    setDeleteError("")
    onDeleteAgent(requestID, pendingDelete.name, pendingDelete.configScope ?? "project")
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
          <Button
            variant="small"
            disabled={dirty || !!savingRequestID}
            title={language.t("settings.agents.import")}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadSimple size={14} weight="bold" />
            <span>{language.t("settings.agents.import")}</span>
          </Button>
          <Button variant="small" disabled={dirty || !!savingRequestID} onClick={() => selectDraft(newDraft(agents), true)}>
            <Plus size={14} weight="bold" />
            <span>{language.t("settings.agents.new")}</span>
          </Button>
        </div>
      </div>
      {importError ? <div className="mb-2 text-[11px] text-[var(--color-error)]">{importError}</div> : null}
      <div className="settings-agent-shell">
        <div className="settings-card settings-agent-list">
          {visibleAgents.length === 0 ? (
            <div className="px-3 py-4 text-[12px] text-[var(--color-muted)]">{language.t("settings.agents.empty")}</div>
          ) : (
            visibleAgents.map((agent) => (
              <button
                type="button"
                key={agent.name}
                className={`settings-agent-list-item ${!creating && agent.name === selected?.name ? "active" : ""}`}
                disabled={!!savingRequestID}
                onClick={() => selectExisting(agent.name)}
              >
                <span className="settings-agent-list-main">
                  <span className="settings-agent-list-name">{titleCase(agent.name)}</span>
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
              <div className="settings-agent-panel-subtitle">
                {creating
                  ? language.t("settings.agents.status.new")
                  : `${selected?.native ? `${language.t("settings.agents.native")} · ` : ""}${language.t(`settings.agents.scope.${draft.scope}`)}`}
              </div>
            </div>
            <div className="settings-agent-panel-actions">
              {selected && !creating ? (
                <Button
                  variant="small"
                  disabled={dirty || !!savingRequestID}
                  title={language.t("settings.agents.duplicate")}
                  onClick={() => selectDraft(duplicateDraft(selected, agents), true)}
                >
                  <Copy size={14} weight="bold" />
                  <span>{language.t("settings.agents.action.duplicate")}</span>
                </Button>
              ) : null}
              <Button
                variant="small"
                disabled={!!savingRequestID}
                title={language.t("settings.agents.export")}
                onClick={exportAgent}
              >
                <DownloadSimple size={14} weight="bold" />
                <span>{language.t("settings.agents.export")}</span>
              </Button>
              {selected && !creating ? (
                <Button
                  variant="small"
                  disabled={dirty || !!savingRequestID}
                  title={selected.native ? language.t("settings.agents.reset") : language.t("settings.agents.delete")}
                  onClick={() => {
                    setPendingDelete(selected)
                    setDeleteError("")
                  }}
                >
                  {selected.native ? (
                    <ArrowCounterClockwise size={14} weight="bold" />
                  ) : (
                    <Trash size={14} weight="bold" />
                  )}
                  <span>
                    {selected.native
                      ? language.t("settings.agents.action.reset")
                      : language.t("settings.agents.action.delete")}
                  </span>
                </Button>
              ) : null}
            </div>
          </div>
          <div className="settings-agent-tabs" role="tablist" aria-label={language.t("settings.agents.editor.label")}>
            {(["overview", "instructions", "permissions"] as const).map((item) => (
              <button
                type="button"
                role="tab"
                aria-selected={editorTab === item}
                className={`settings-agent-tab ${editorTab === item ? "active" : ""}`}
                onClick={() => setEditorTab(item)}
                key={item}
              >
                {language.t(`settings.agents.tab.${item}`)}
              </button>
            ))}
          </div>

          <fieldset className="settings-agent-fields" disabled={!!savingRequestID} aria-busy={!!savingRequestID}>
            {editorTab === "overview" ? (
              <div className="settings-agent-editor-body">
                <div className="settings-agent-section-title">{language.t("settings.agents.identity")}</div>
                <SettingsRow
                  title={language.t("settings.agents.name.title")}
                  description={language.t("settings.agents.name.description")}
                >
                  <div className="flex w-full flex-col gap-1">
                    <TextInput
                      className="settings-provider-input w-full"
                      value={draft.name}
                      onChange={(value) => updateDraft("name", value)}
                      placeholder="custom-agent"
                    />
                    {invalidName || duplicateName ? (
                      <div className="text-[11px] text-[var(--color-error)]">
                        {invalidName
                          ? language.t("settings.agents.error.name")
                          : language.t("settings.agents.error.duplicate")}
                      </div>
                    ) : null}
                  </div>
                </SettingsRow>
                <SettingsRow
                  title={language.t("settings.agents.scope.title")}
                  description={language.t("settings.agents.scope.description")}
                >
                  <Select
                    className="settings-select"
                    value={draft.scope}
                    onChange={(value) => updateDraft("scope", value as RaccoonAgentScope)}
                    options={[
                      { value: "project", label: language.t("settings.agents.scope.project") },
                      { value: "user", label: language.t("settings.agents.scope.user") },
                    ]}
                  />
                </SettingsRow>
                <div className="settings-agent-section-title">{language.t("settings.agents.behavior")}</div>
                <SettingsRow
                  title={language.t("settings.agents.description.title")}
                  description={language.t("settings.agents.description.description")}
                >
                  <textarea
                    className="settings-agent-description"
                    value={draft.description}
                    onChange={(event) => updateDraft("description", event.currentTarget.value)}
                    placeholder={language.t("settings.agents.description.placeholder")}
                  />
                </SettingsRow>
                <SettingsRow
                  title={language.t("settings.agents.mode.title")}
                  description={language.t("settings.agents.mode.description")}
                >
                  <Select
                    className="settings-select"
                    value={draft.mode}
                    onChange={(value) => updateDraft("mode", value as RaccoonAgentMode)}
                    options={[
                      { value: "primary", label: language.t("settings.agents.mode.primary") },
                      { value: "subagent", label: language.t("settings.agents.mode.subagent") },
                      { value: "all", label: language.t("settings.agents.mode.all") },
                    ]}
                  />
                </SettingsRow>
                <SettingsRow
                  title={language.t("settings.agents.model.title")}
                  description={language.t("settings.agents.model.description")}
                >
                  <ModelPicker
                    value={draft.model}
                    models={connectedModels}
                    onChange={(model) => updateDraft("model", model)}
                    ariaLabel={language.t("settings.agents.model.title")}
                    placeholder={language.t("settings.models.noModel")}
                    compact
                    placement="bottom"
                    maxWidth={255}
                  />
                </SettingsRow>
                <SettingsRow
                  title={language.t("settings.agents.parameters.title")}
                  description={language.t("settings.agents.parameters.description")}
                >
                  <div className="settings-agent-params">
                    <label>
                      <span>temperature</span>
                      <TextInput
                        value={draft.temperature}
                        onChange={(value) => updateDraft("temperature", value)}
                        placeholder="0 – 2"
                      />
                    </label>
                    <label>
                      <span>top_p</span>
                      <TextInput
                        value={draft.topP}
                        onChange={(value) => updateDraft("topP", value)}
                        placeholder="0 – 1"
                      />
                    </label>
                    <label>
                      <span>steps</span>
                      <TextInput
                        value={draft.steps}
                        onChange={(value) => updateDraft("steps", value)}
                        placeholder="1 – 100"
                      />
                    </label>
                  </div>
                </SettingsRow>
                <SettingsRow
                  title={language.t("settings.agents.hidden.title")}
                  description={language.t("settings.agents.hidden.description")}
                >
                  <input
                    type="checkbox"
                    role="switch"
                    className="settings-toggle"
                    checked={draft.hidden}
                    onChange={(event) => updateDraft("hidden", event.currentTarget.checked)}
                  />
                </SettingsRow>
              </div>
            ) : null}

            {editorTab === "instructions" ? (
              <div className="settings-agent-editor-body settings-agent-instructions">
                <SettingsRow
                  title={language.t("settings.agents.prompt.title")}
                  description={language.t("settings.agents.prompt.description")}
                >
                  <textarea
                    className="settings-agent-prompt"
                    value={draft.prompt}
                    onChange={(event) => updateDraft("prompt", event.currentTarget.value)}
                    placeholder={language.t("settings.agents.prompt.placeholder")}
                  />
                </SettingsRow>
              </div>
            ) : null}

            {editorTab === "permissions" ? (
              <div className="settings-agent-editor-body settings-agent-permissions">
                <PermissionEditor
                  permission={draft.permission}
                  rules={editingRules}
                  inherited
                  onChange={applyPermission}
                />
                {editingRules && editingRules.length > 0 ? (
                  <PermissionRuleset agent={draft.name} rules={editingRules} />
                ) : null}
              </div>
            ) : null}
          </fieldset>

          {dirty || savingRequestID || saveError ? (
            <div className="settings-agent-savebar">
              <div className={`settings-agent-save-status ${saveError ? "error" : "dirty"}`}>
                {saveError || notice || language.t(savingRequestID ? "settings.agents.saving" : "settings.agents.unsaved")}
              </div>
              <div className="settings-agent-save-actions">
                <Button variant="secondary" disabled={!!savingRequestID} onClick={discard}>
                  {language.t("settings.agents.cancel")}
                </Button>
                <Button
                  variant="primary"
                  disabled={invalidName || duplicateName || !!savingRequestID}
                  onClick={save}
                >
                  {language.t("settings.agents.save")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {pendingDelete ? (
        <SettingsDialog
          titleId="agent-delete"
          title={language.t(pendingDelete.native ? "settings.agents.reset" : "settings.agents.delete")}
          className="settings-rules-confirm-dialog"
          onClose={() => {
            if (deletingRequestID) return
            setPendingDelete(undefined)
            setDeleteError("")
          }}
          footer={
            <>
              <Button
                variant="small"
                disabled={!!deletingRequestID}
                onClick={() => {
                  setPendingDelete(undefined)
                  setDeleteError("")
                }}
              >
                {language.t("common.cancel")}
              </Button>
              <Button
                variant="small"
                className="settings-rules-danger"
                disabled={!!deletingRequestID}
                onClick={confirmDelete}
              >
                {language.t(
                  deletingRequestID
                    ? "settings.agents.deleting"
                    : pendingDelete.native
                      ? "settings.agents.action.reset"
                      : "settings.agents.action.delete",
                )}
              </Button>
            </>
          }
        >
          <div>
            {language.t(pendingDelete.native ? "settings.agents.resetConfirm" : "settings.agents.deleteConfirm", {
              name: pendingDelete.name,
            })}
          </div>
          {deleteError ? <div className="mt-2 text-[11px] text-[var(--color-error)]">{deleteError}</div> : null}
        </SettingsDialog>
      ) : null}
    </>
  )
}
