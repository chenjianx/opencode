import { useEffect, useMemo, useState } from "react"
import { Plus, Trash } from "@phosphor-icons/react"
import type { RaccoonAgentScope, RaccoonRule } from "../../protocol"
import { useLanguage } from "../../context/language"
import { useSessionActions } from "../../context/session"
import { useVSCode } from "../../context/vscode"
import { SettingsDialog } from "./settings-dialog"
import { Button } from "../ui"
import { Select } from "./settings-common"
import { MarkdownLite } from "../ui/markdown-lite"
import { NAME_RE, uniqueName } from "./utils"

type RuleDraft = {
  scope: RaccoonAgentScope
  originalName: string // "" when creating
  name: string
  content: string
}

export function SettingsRules(props: {
  rules: RaccoonRule[]
  onSaveRule: (requestID: string, scope: RaccoonAgentScope, originalName: string, name: string, content: string) => void
  onToggleRule: (requestID: string, scope: RaccoonAgentScope, name: string, enabled: boolean) => void
  onDeleteRule: (requestID: string, scope: RaccoonAgentScope, name: string) => void
}) {
  const language = useLanguage()
  const actions = useSessionActions()
  const vscode = useVSCode()
  const { rules, onSaveRule, onToggleRule, onDeleteRule } = props
  const [draft, setDraft] = useState<RuleDraft | undefined>()
  const [editorTab, setEditorTab] = useState<"edit" | "preview">("edit")
  const [pendingDelete, setPendingDelete] = useState<RaccoonRule | undefined>()
  const [savingRequestID, setSavingRequestID] = useState<string>()
  const [saveError, setSaveError] = useState("")
  const [deletingRequestID, setDeletingRequestID] = useState<string>()
  const [deleteError, setDeleteError] = useState("")
  const [pendingToggle, setPendingToggle] = useState<{
    requestID: string
    scope: RaccoonAgentScope
    name: string
    enabled: boolean
  }>()
  const [toggleError, setToggleError] = useState("")

  const listItems = useMemo(
    () => rules.slice().sort((a, b) => a.name.localeCompare(b.name) || a.scope.localeCompare(b.scope)),
    [rules],
  )
  const groups = useMemo(
    () =>
      (["project", "user"] as const)
        .map((scope) => ({ scope, rules: listItems.filter((rule) => rule.scope === scope) }))
        .filter((group) => group.rules.length > 0),
    [listItems],
  )

  // If the rule being edited disappears (deleted/renamed by a refresh), close the editor.
  useEffect(() => {
    if (!draft || !draft.originalName || savingRequestID) return
    if (!rules.some((rule) => rule.scope === draft.scope && rule.name === draft.originalName)) setDraft(undefined)
  }, [rules, draft, savingRequestID])

  useEffect(() => {
    return vscode.onMessage((message) => {
      if (message.type === "ruleSaveResult" && message.requestID === savingRequestID) {
        setSavingRequestID(undefined)
        if (!message.success) {
          setSaveError(message.error ?? language.t("settings.rules.error.save"))
          return
        }
        setSaveError("")
        setDraft(undefined)
        return
      }
      if (message.type === "ruleDeleteResult" && message.requestID === deletingRequestID) {
        setDeletingRequestID(undefined)
        if (!message.success) {
          setDeleteError(message.error ?? language.t("settings.rules.error.delete"))
          return
        }
        if (draft && pendingDelete && draft.originalName === pendingDelete.name && draft.scope === pendingDelete.scope) {
          setDraft(undefined)
        }
        setPendingDelete(undefined)
        setDeleteError("")
        return
      }
      if (message.type !== "ruleToggleResult" || message.requestID !== pendingToggle?.requestID) return
      setPendingToggle(undefined)
      setToggleError(message.success ? "" : message.error ?? language.t("settings.rules.error.toggle"))
    })
  }, [deletingRequestID, draft, language, pendingDelete, pendingToggle, savingRequestID, vscode])

  const trimmedName = draft?.name.trim() ?? ""
  const invalidName = !!draft && !NAME_RE.test(trimmedName)
  const duplicateName =
    !!draft &&
    rules.some(
      (rule) => rule.scope === draft.scope && rule.name === trimmedName && rule.name !== draft.originalName,
    )
  const canSave = !!draft && !invalidName && !duplicateName

  const editRule = (rule: RaccoonRule) => {
    if (savingRequestID) return
    setEditorTab("edit")
    setDraft({ scope: rule.scope, originalName: rule.name, name: rule.name, content: rule.content })
    setSaveError("")
  }
  const createRule = () => {
    if (savingRequestID) return
    setEditorTab("edit")
    setDraft({
      scope: "project",
      originalName: "",
      name: uniqueName("new-rule", rules.filter((rule) => rule.scope === "project").map((rule) => rule.name)),
      content: "",
    })
    setSaveError("")
  }
  const save = () => {
    if (!draft || !canSave || savingRequestID || deletingRequestID || pendingToggle) return
    const requestID = crypto.randomUUID()
    setSavingRequestID(requestID)
    setSaveError("")
    onSaveRule(requestID, draft.scope, draft.originalName, trimmedName, draft.content)
  }
  const toggle = (rule: RaccoonRule, enabled: boolean) => {
    if (pendingToggle || savingRequestID || deletingRequestID) return
    const requestID = crypto.randomUUID()
    setPendingToggle({ requestID, scope: rule.scope, name: rule.name, enabled })
    setToggleError("")
    onToggleRule(requestID, rule.scope, rule.name, enabled)
  }
  const confirmDelete = () => {
    if (!pendingDelete || deletingRequestID || savingRequestID || pendingToggle) return
    const requestID = crypto.randomUUID()
    setDeletingRequestID(requestID)
    setDeleteError("")
    onDeleteRule(requestID, pendingDelete.scope, pendingDelete.name)
  }

  const scopeLabel = (scope: RaccoonAgentScope) =>
    scope === "project" ? language.t("settings.rules.scope.project") : language.t("settings.rules.scope.user")

  return (
    <>
      <div className="settings-rules-root">
        <h3>{language.t("settings.nav.rules")}</h3>
        <div className="settings-rules-intro">
          <div className="settings-rules-hint">{language.t("settings.rules.subtitle")}</div>
          <Button variant="small" disabled={!!savingRequestID} onClick={createRule}>
            <Plus size={14} weight="bold" />
            <span>{language.t("settings.rules.new")}</span>
          </Button>
        </div>
        {toggleError ? <div className="settings-rules-error">{toggleError}</div> : null}

        <div className="settings-rules-shell">
          <div className="settings-rules-pane">
            <div className="settings-rules-tree">
              {listItems.length === 0 ? (
                <div className="settings-rules-group-empty">{language.t("settings.rules.empty")}</div>
              ) : (
                groups.map((group) => (
                  <section key={group.scope} className="settings-rules-group" aria-label={scopeLabel(group.scope)}>
                    <div className="settings-rules-group-header">
                      <span className="settings-rules-group-label">{scopeLabel(group.scope)}</span>
                      <span className="settings-rules-count">{group.rules.length}</span>
                    </div>
                    <div className="settings-rules-children">
                      {group.rules.map((rule) => {
                        const active = draft?.originalName === rule.name && draft.scope === rule.scope
                        const toggling = pendingToggle?.scope === rule.scope && pendingToggle.name === rule.name
                        return (
                          <div
                            key={rule.name}
                            className={`settings-rules-node${active ? " active" : ""}${rule.enabled ? "" : " disabled"}`}
                          >
                            <button
                              type="button"
                              className="settings-rules-node-main"
                              disabled={!!savingRequestID}
                              onClick={() => editRule(rule)}
                            >
                              <span className="settings-rules-card-name">{rule.name}</span>
                            </button>
                            <div className="settings-rules-node-meta">
                              <input
                                type="checkbox"
                                role="switch"
                                className="settings-toggle settings-rules-node-toggle"
                                checked={toggling ? pendingToggle.enabled : rule.enabled}
                                disabled={!!pendingToggle}
                                aria-label={language.t("settings.rules.toggle")}
                                title={
                                  rule.enabled
                                    ? language.t("settings.rules.enabled")
                                    : language.t("settings.rules.disabled")
                                }
                                onChange={(event) => toggle(rule, event.currentTarget.checked)}
                              />
                              <Button
                                variant="icon"
                                className="settings-rules-node-delete"
                                title={language.t("settings.rules.delete")}
                                disabled={!!savingRequestID || !!deletingRequestID || !!pendingToggle}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setPendingDelete(rule)
                                }}
                              >
                                <Trash size={14} />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ))
              )}
            </div>
          </div>

          <div className="settings-rules-editor">
            {draft ? (
              <>
                <div className="settings-rules-editor-header">
                  <span className="settings-rules-editor-title">
                    {draft.originalName
                      ? language.t("settings.rules.editing", { name: draft.originalName })
                      : language.t("settings.rules.new")}
                  </span>
                  <div className="settings-rules-editor-actions">
                    <span className={`settings-rules-scope-count ${draft.scope}`}>{scopeLabel(draft.scope)}</span>
                  </div>
                </div>
                <div className="settings-rules-editor-body">
                  {!draft.originalName ? (
                    <label className="settings-rules-field">
                      <span>{language.t("settings.rules.scope.title")}</span>
                      <Select
                        value={draft.scope}
                        ariaLabel={language.t("settings.rules.scope.title")}
                        disabled={!!savingRequestID}
                        options={[
                          { value: "project", label: language.t("settings.rules.scope.project") },
                          { value: "user", label: language.t("settings.rules.scope.user") },
                        ]}
                        onChange={(scope) => {
                          const nextScope: RaccoonAgentScope = scope === "user" ? "user" : "project"
                          setDraft((current) => {
                            if (!current) return current
                            return {
                              ...current,
                              scope: nextScope,
                              name: uniqueName(
                                current.name,
                                rules.filter((rule) => rule.scope === nextScope).map((rule) => rule.name),
                              ),
                            }
                          })
                        }}
                      />
                    </label>
                  ) : null}
                  <label className="settings-rules-field">
                    <span>{language.t("settings.rules.name.title")}</span>
                    <input
                      className="settings-provider-input w-full"
                      value={draft.name}
                      disabled={!!savingRequestID}
                      placeholder="my-rule"
                      onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
                    />
                    {invalidName || duplicateName ? (
                      <span className="settings-rules-error">
                        {invalidName
                          ? language.t("settings.rules.error.name")
                          : language.t("settings.rules.error.duplicate")}
                      </span>
                    ) : null}
                  </label>

                  <div className="settings-rules-tabs">
                    <button
                      type="button"
                      className={`settings-rules-tab ${editorTab === "edit" ? "active" : ""}`}
                      onClick={() => setEditorTab("edit")}
                      disabled={!!savingRequestID}
                    >
                      {language.t("settings.rules.content")}
                    </button>
                    <button
                      type="button"
                      className={`settings-rules-tab ${editorTab === "preview" ? "active" : ""}`}
                      onClick={() => setEditorTab("preview")}
                      disabled={!!savingRequestID}
                    >
                      {language.t("settings.rules.preview")}
                    </button>
                  </div>

                  <div className="settings-rules-editor-area">
                    {editorTab === "edit" ? (
                      <textarea
                        className="settings-rules-textarea"
                        value={draft.content}
                        disabled={!!savingRequestID}
                        placeholder={language.t("settings.rules.content.placeholder")}
                        onChange={(event) => setDraft({ ...draft, content: event.currentTarget.value })}
                      />
                    ) : (
                      <div className="settings-rules-preview">
                        {draft.content.trim() ? (
                          <MarkdownLite text={draft.content} onOpenFile={actions.openFile} />
                        ) : (
                          <div className="settings-rules-hint">{language.t("settings.rules.preview.empty")}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="settings-rules-editor-footer">
                  {saveError ? <span className="settings-rules-error">{saveError}</span> : null}
                  <Button variant="small" disabled={!!savingRequestID} onClick={() => setDraft(undefined)}>
                    {language.t("common.cancel")}
                  </Button>
                  <Button
                    variant="small"
                    className="settings-rules-save"
                    disabled={!canSave || !!savingRequestID || !!deletingRequestID || !!pendingToggle}
                    onClick={save}
                  >
                    {language.t(savingRequestID ? "settings.rules.saving" : "settings.actions.save")}
                  </Button>
                </div>
              </>
            ) : (
              <div className="settings-rules-empty-pane">{language.t("settings.rules.selectHint")}</div>
            )}
          </div>
        </div>
      </div>

      {pendingDelete ? (
        <SettingsDialog
          titleId="rule-delete"
          title={language.t("settings.rules.delete")}
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
                {language.t(deletingRequestID ? "settings.rules.deleting" : "settings.rules.delete")}
              </Button>
            </>
          }
        >
          <div>{language.t("settings.rules.deleteConfirm", { name: pendingDelete.name })}</div>
          {deleteError ? <div className="settings-rules-error">{deleteError}</div> : null}
        </SettingsDialog>
      ) : null}
    </>
  )
}
