import { Plus, Trash } from "@phosphor-icons/react"
import { useEffect, useMemo, useState } from "react"
import type {
  RaccoonAgent,
  RaccoonAgentScope,
  RaccoonCommand,
  RaccoonManagedCommand,
  RaccoonManagedCommandInput,
  RaccoonModel,
} from "../../protocol"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import { SettingsDialog } from "./settings-dialog"
import { Button } from "../ui"
import { ModelPicker } from "../ui/model-picker"
import { Select } from "./settings-common"
import { formatModelString, NAME_RE, parseModelString, uniqueName } from "./utils"

type CommandDraft = {
  scope: RaccoonAgentScope
  originalName: string
  name: string
  description: string
  agent: string
  model?: { providerID: string; modelID: string }
  subtask: boolean
  template: string
}

type CommandListItem =
  | { type: "config"; command: RaccoonManagedCommand }
  | { type: "builtin"; command: RaccoonCommand }

function commandDraft(command: RaccoonManagedCommand | undefined, scope: RaccoonAgentScope, name: string): CommandDraft {
  return {
    scope,
    originalName: command?.name ?? "",
    name: command?.name ?? name,
    description: command?.description ?? "",
    agent: command?.agent ?? "",
    model: parseModelString(command?.model),
    subtask: command?.subtask ?? false,
    template: command?.template ?? "",
  }
}

function commandInput(draft: CommandDraft): RaccoonManagedCommandInput {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    agent: draft.agent.trim() || undefined,
    model: draft.model ? formatModelString(draft.model) : undefined,
    subtask: draft.subtask || undefined,
    template: draft.template,
  }
}

export function SettingsCommands(props: {
  commandConfigs: RaccoonManagedCommand[]
  availableCommands: RaccoonCommand[]
  agents: RaccoonAgent[]
  connectedModels: RaccoonModel[]
  onSaveCommand: (requestID: string, scope: RaccoonAgentScope, originalName: string, command: RaccoonManagedCommandInput) => void
  onDeleteCommand: (requestID: string, scope: RaccoonAgentScope, name: string) => void
}) {
  const language = useLanguage()
  const vscode = useVSCode()
  const [draft, setDraft] = useState<CommandDraft | undefined>()
  const [selectedBuiltin, setSelectedBuiltin] = useState<RaccoonCommand | undefined>()
  const [pendingDelete, setPendingDelete] = useState<RaccoonManagedCommand | undefined>()
  const [savingRequestID, setSavingRequestID] = useState<string>()
  const [saveError, setSaveError] = useState("")
  const [deletingRequestID, setDeletingRequestID] = useState<string>()
  const [deleteError, setDeleteError] = useState("")

  const commands = useMemo(
    () => props.commandConfigs.slice().sort((a, b) => a.name.localeCompare(b.name) || a.scope.localeCompare(b.scope)),
    [props.commandConfigs],
  )
  const listItems = useMemo<CommandListItem[]>(() => {
    const configured = new Set(commands.map((command) => command.name))
    return [
      ...commands.map((command): CommandListItem => ({ type: "config", command })),
      ...props.availableCommands
        .filter((command) => command.source === "command" && !configured.has(command.name))
        .map((command): CommandListItem => ({ type: "builtin", command })),
    ].sort((a, b) => a.command.name.localeCompare(b.command.name) || a.type.localeCompare(b.type))
  }, [commands, props.availableCommands])
  const selectedBuiltinHints = useMemo(
    () => selectedBuiltin?.hints.filter((hint, index, hints) => hints.indexOf(hint) === index) ?? [],
    [selectedBuiltin],
  )
  const agents = props.agents.filter((agent) => !agent.hidden)
  const trimmedName = draft?.name.trim() ?? ""
  const invalidName = !!draft && !NAME_RE.test(trimmedName)
  const duplicateName =
    !!draft &&
    commands.some(
      (command) => command.scope === draft.scope && command.name === trimmedName && command.name !== draft.originalName,
    )
  const canSave = !!draft && !invalidName && !duplicateName && draft.template.trim().length > 0

  useEffect(() => {
    if (!draft?.originalName || savingRequestID) return
    if (!commands.some((command) => command.scope === draft.scope && command.name === draft.originalName)) {
      setDraft(undefined)
    }
  }, [draft, commands, savingRequestID])

  useEffect(() => {
    return vscode.onMessage((message) => {
      if (message.type === "commandSaveResult" && message.requestID === savingRequestID) {
        setSavingRequestID(undefined)
        if (!message.success) {
          setSaveError(message.error ?? language.t("settings.commands.error.save"))
          return
        }
        setSaveError("")
        setDraft(undefined)
        return
      }
      if (message.type !== "commandDeleteResult" || message.requestID !== deletingRequestID) return
      setDeletingRequestID(undefined)
      if (!message.success) {
        setDeleteError(message.error ?? language.t("settings.commands.error.delete"))
        return
      }
      if (draft && pendingDelete && draft.originalName === pendingDelete.name && draft.scope === pendingDelete.scope) {
        setDraft(undefined)
      }
      setPendingDelete(undefined)
      setDeleteError("")
    })
  }, [deletingRequestID, draft, language, pendingDelete, savingRequestID, vscode])

  const createCommand = () => {
    if (savingRequestID) return
    setSelectedBuiltin(undefined)
    setDraft(commandDraft(undefined, "project", uniqueName("new-command", commands.filter((command) => command.scope === "project").map((command) => command.name))))
    setSaveError("")
  }
  const editCommand = (command: RaccoonManagedCommand) => {
    if (savingRequestID) return
    setSelectedBuiltin(undefined)
    setDraft(commandDraft(command, command.scope, command.name))
    setSaveError("")
  }
  const showBuiltin = (command: RaccoonCommand) => {
    if (savingRequestID) return
    setDraft(undefined)
    setSelectedBuiltin(command)
  }
  const save = () => {
    if (!draft || !canSave || savingRequestID || deletingRequestID) return
    const requestID = crypto.randomUUID()
    setSavingRequestID(requestID)
    setSaveError("")
    props.onSaveCommand(requestID, draft.scope, draft.originalName, commandInput(draft))
  }
  const confirmDelete = () => {
    if (!pendingDelete || deletingRequestID || savingRequestID) return
    const requestID = crypto.randomUUID()
    setDeletingRequestID(requestID)
    setDeleteError("")
    props.onDeleteCommand(requestID, pendingDelete.scope, pendingDelete.name)
  }
  const scopeLabel = (scope: RaccoonAgentScope) =>
    scope === "project" ? language.t("settings.commands.scope.project") : language.t("settings.commands.scope.user")

  return (
    <>
      <div className="settings-rules-root settings-commands-root">
        <h3>{language.t("settings.commands.title")}</h3>
        <div className="settings-rules-intro settings-commands-header">
          <div className="settings-rules-hint">{language.t("settings.commands.subtitle")}</div>
          <Button variant="small" disabled={!!savingRequestID} onClick={createCommand}>
            <Plus size={14} weight="bold" />
            <span>{language.t("settings.commands.new")}</span>
          </Button>
        </div>

        <div className="settings-rules-shell settings-commands-shell">
          <div className="settings-rules-pane settings-commands-pane">
            <div className="settings-rules-tree">
              {listItems.length === 0 ? (
                <div className="settings-rules-group-empty">{language.t("settings.commands.empty")}</div>
              ) : (
                listItems.map((item) => {
                  const active =
                    item.type === "config"
                      ? draft?.scope === item.command.scope && draft.originalName === item.command.name
                      : !draft && selectedBuiltin?.name === item.command.name
                  return (
                    <button
                      type="button"
                      key={`${item.type}:${item.command.name}${item.type === "config" ? `:${item.command.scope}` : ""}`}
                      className={`settings-rules-node settings-commands-node ${active ? "active" : ""}`}
                      disabled={!!savingRequestID}
                      onClick={() => (item.type === "config" ? editCommand(item.command) : showBuiltin(item.command))}
                    >
                      <span className="settings-rules-node-main settings-commands-node-main">
                        <span className="settings-rules-card-name settings-commands-node-name">/{item.command.name}</span>
                      </span>
                      <div className="settings-commands-node-meta">
                        {item.type === "config" ? (
                          <span className={`settings-rules-scope-count settings-commands-scope ${item.command.scope}`}>
                            {scopeLabel(item.command.scope)}
                          </span>
                        ) : (
                          <span className="settings-rules-scope-count settings-commands-scope builtin">
                            {language.t("settings.commands.scope.builtin")}
                          </span>
                        )}
                        {item.type === "config" ? (
                          <Button
                            variant="icon"
                            className="settings-rules-danger settings-rules-node-delete settings-commands-node-delete"
                            title={language.t("settings.commands.delete")}
                            onClick={(event) => {
                              event.stopPropagation()
                              setPendingDelete(item.command)
                            }}
                          >
                            <Trash size={14} />
                          </Button>
                        ) : null}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div className="settings-rules-editor settings-commands-editor">
            {selectedBuiltin ? (
              <>
                <div className="settings-rules-editor-header settings-commands-editor-header">
                  <span className="settings-rules-editor-title settings-commands-readonly-title">
                    /{selectedBuiltin.name}
                  </span>
                  <span className="settings-rules-scope-count settings-commands-scope builtin">
                    {language.t("settings.commands.scope.builtin")}
                  </span>
                </div>
                <div className="settings-rules-editor-body settings-commands-editor-body">
                  <div className="settings-commands-readonly settings-commands-field-wide">
                    {selectedBuiltin.description ? (
                      <div className="settings-commands-readonly-description">{selectedBuiltin.description}</div>
                    ) : (
                      <div className="settings-commands-readonly-description">{language.t("settings.commands.readonly.noDescription")}</div>
                    )}
                    <div className="settings-commands-readonly-note">{language.t("settings.commands.readonly.note")}</div>
                    {selectedBuiltinHints.length > 0 ? (
                      <div className="settings-commands-readonly-hints">
                        <span>{language.t("settings.commands.readonly.hints")}</span>
                        <div>
                          {selectedBuiltinHints.map((hint) => (
                            <code key={hint}>{hint}</code>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </>
            ) : draft ? (
              <>
                <div className="settings-rules-editor-header settings-commands-editor-header">
                  <span className="settings-rules-editor-title">
                    {draft.originalName
                      ? language.t("settings.commands.editing", { name: draft.originalName })
                      : language.t("settings.commands.new")}
                  </span>
                  <span className={`settings-rules-scope-count settings-commands-scope ${draft.scope}`}>{scopeLabel(draft.scope)}</span>
                </div>
                <div className="settings-rules-editor-body settings-commands-editor-body">
                  {!draft.originalName ? (
                    <label className="settings-rules-field settings-commands-field">
                      <span>{language.t("settings.commands.scope.title")}</span>
                      <Select
                        value={draft.scope}
                        ariaLabel={language.t("settings.commands.scope.title")}
                        disabled={!!savingRequestID}
                        options={[
                          { value: "project", label: language.t("settings.commands.scope.project") },
                          { value: "user", label: language.t("settings.commands.scope.user") },
                        ]}
                        onChange={(scope) => {
                          const nextScope = scope === "user" ? "user" : "project"
                          setDraft((current) => {
                            if (!current) return current
                            return {
                              ...current,
                              scope: nextScope,
                              name: uniqueName(current.name, commands.filter((command) => command.scope === nextScope).map((command) => command.name)),
                            }
                          })
                        }}
                      />
                    </label>
                  ) : null}
                  <label className="settings-rules-field settings-commands-field">
                    <span>{language.t("settings.commands.name.title")}</span>
                    <input
                      className="settings-provider-input w-full"
                      value={draft.name}
                      disabled={!!savingRequestID}
                      placeholder={language.t("settings.commands.name.placeholder")}
                      onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
                    />
                    {invalidName || duplicateName ? (
                      <span className="settings-rules-error">
                        {invalidName ? language.t("settings.commands.error.name") : language.t("settings.commands.error.duplicate")}
                      </span>
                    ) : null}
                  </label>
                  <label className="settings-rules-field settings-commands-field settings-commands-field-wide">
                    <span>{language.t("settings.commands.description.title")}</span>
                    <textarea
                      className="settings-provider-input settings-commands-description w-full"
                      value={draft.description}
                      disabled={!!savingRequestID}
                      placeholder={language.t("settings.commands.description.placeholder")}
                      onChange={(event) => setDraft({ ...draft, description: event.currentTarget.value })}
                    />
                  </label>
                  <label className="settings-rules-field settings-commands-field">
                    <span>{language.t("settings.commands.agent.title")}</span>
                    <Select
                      value={draft.agent}
                      ariaLabel={language.t("settings.commands.agent.title")}
                      disabled={!!savingRequestID}
                      placeholder={language.t("settings.commands.agent.default")}
                      options={agents.map((agent) => ({ value: agent.name, label: agent.name }))}
                      onChange={(agent) => setDraft({ ...draft, agent })}
                    />
                  </label>
                  <label className="settings-rules-field settings-commands-field">
                    <span>{language.t("settings.commands.model.title")}</span>
                    <ModelPicker
                      models={props.connectedModels}
                      disabled={!!savingRequestID}
                      value={draft.model}
                      ariaLabel={language.t("settings.commands.model.title")}
                      placeholder={language.t("settings.models.noModel")}
                      onChange={(model) => setDraft({ ...draft, model })}
                      allowUnset
                      onUnset={() => setDraft({ ...draft, model: undefined })}
                    />
                  </label>
                  <label className="settings-rules-field settings-commands-field settings-commands-subtask">
                    <span>{language.t("settings.commands.subtask.title")}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      className="settings-toggle"
                      checked={draft.subtask}
                      disabled={!!savingRequestID}
                      onChange={(event) => setDraft({ ...draft, subtask: event.currentTarget.checked })}
                    />
                  </label>
                  <label className="settings-rules-field settings-commands-field settings-commands-field-wide settings-commands-template">
                    <span>{language.t("settings.commands.template.title")}</span>
                    <textarea
                      className="settings-rules-textarea settings-commands-textarea"
                      value={draft.template}
                      disabled={!!savingRequestID}
                      placeholder={language.t("settings.commands.template.placeholder")}
                      onChange={(event) => setDraft({ ...draft, template: event.currentTarget.value })}
                    />
                    {draft.template.trim().length === 0 ? (
                      <span className="settings-rules-error">{language.t("settings.commands.error.template")}</span>
                    ) : null}
                  </label>
                </div>
                <div className="settings-rules-editor-footer settings-commands-editor-footer">
                  {saveError ? <span className="settings-rules-error">{saveError}</span> : null}
                  <Button variant="small" disabled={!!savingRequestID} onClick={() => setDraft(undefined)}>
                    {language.t("common.cancel")}
                  </Button>
                  <Button
                    variant="small"
                    className="settings-rules-save"
                    disabled={!canSave || !!savingRequestID || !!deletingRequestID}
                    onClick={save}
                  >
                    {language.t(savingRequestID ? "settings.commands.saving" : "settings.actions.save")}
                  </Button>
                </div>
              </>
            ) : (
              <div className="settings-rules-empty-pane">{language.t("settings.commands.selectHint")}</div>
            )}
          </div>
        </div>
      </div>

      {pendingDelete ? (
        <SettingsDialog
          titleId="command-delete"
          title={language.t("settings.commands.delete")}
          className="settings-rules-confirm-dialog"
          onClose={() => {
            if (deletingRequestID) return
            setPendingDelete(undefined)
            setDeleteError("")
          }}
          footer={
            <>
              <Button variant="small" disabled={!!deletingRequestID} onClick={() => setPendingDelete(undefined)}>
                {language.t("common.cancel")}
              </Button>
              <Button
                variant="small"
                className="settings-rules-danger"
                disabled={!!deletingRequestID}
                onClick={confirmDelete}
              >
                {language.t(deletingRequestID ? "settings.commands.deleting" : "settings.commands.delete")}
              </Button>
            </>
          }
        >
          <div>{language.t("settings.commands.deleteConfirm", { name: pendingDelete.name })}</div>
          {deleteError ? <div className="settings-rules-error">{deleteError}</div> : null}
        </SettingsDialog>
      ) : null}
    </>
  )
}
