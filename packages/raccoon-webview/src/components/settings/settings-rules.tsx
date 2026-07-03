import { useEffect, useMemo, useState } from "react"
import { Plus, Trash } from "@phosphor-icons/react"
import type { RaccoonAgentScope, RaccoonRule } from "../../protocol"
import { useLanguage } from "../../context/language"
import { useSessionActions } from "../../context/session"
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
  onSaveRule: (scope: RaccoonAgentScope, originalName: string, name: string, content: string) => void
  onToggleRule: (scope: RaccoonAgentScope, name: string, enabled: boolean) => void
  onDeleteRule: (scope: RaccoonAgentScope, name: string) => void
}) {
  const language = useLanguage()
  const actions = useSessionActions()
  const { rules, onSaveRule, onToggleRule, onDeleteRule } = props
  const [draft, setDraft] = useState<RuleDraft | undefined>()
  const [editorTab, setEditorTab] = useState<"edit" | "preview">("edit")
  const [pendingDelete, setPendingDelete] = useState<RaccoonRule | undefined>()

  const listItems = useMemo(
    () => rules.slice().sort((a, b) => a.name.localeCompare(b.name) || a.scope.localeCompare(b.scope)),
    [rules],
  )

  // If the rule being edited disappears (deleted/renamed by a refresh), close the editor.
  useEffect(() => {
    if (!draft || !draft.originalName) return
    if (!rules.some((rule) => rule.scope === draft.scope && rule.name === draft.originalName)) setDraft(undefined)
  }, [rules, draft])

  const trimmedName = draft?.name.trim() ?? ""
  const invalidName = !!draft && !NAME_RE.test(trimmedName)
  const duplicateName =
    !!draft &&
    rules.some(
      (rule) => rule.scope === draft.scope && rule.name === trimmedName && rule.name !== draft.originalName,
    )
  const canSave = !!draft && !invalidName && !duplicateName

  const editRule = (rule: RaccoonRule) => {
    setEditorTab("edit")
    setDraft({ scope: rule.scope, originalName: rule.name, name: rule.name, content: rule.content })
  }
  const createRule = () => {
    setEditorTab("edit")
    setDraft({
      scope: "project",
      originalName: "",
      name: uniqueName("new-rule", rules.filter((rule) => rule.scope === "project").map((rule) => rule.name)),
      content: "",
    })
  }
  const save = () => {
    if (!draft || !canSave) return
    onSaveRule(draft.scope, draft.originalName, trimmedName, draft.content)
    setDraft(undefined)
  }

  const scopeLabel = (scope: RaccoonAgentScope) =>
    scope === "project" ? language.t("settings.rules.scope.project") : language.t("settings.rules.scope.user")

  return (
    <>
      <div className="settings-rules-root settings-commands-root">
        <h3>{language.t("settings.nav.rules")}</h3>
        <div className="settings-rules-intro settings-commands-header">
          <div className="settings-rules-hint">{language.t("settings.rules.subtitle")}</div>
          <Button variant="small" onClick={createRule}>
            <Plus size={14} weight="bold" />
            <span>{language.t("settings.rules.new")}</span>
          </Button>
        </div>

        <div className="settings-rules-shell settings-commands-shell">
          <div className="settings-rules-pane settings-commands-pane">
            <div className="settings-rules-tree">
              {listItems.length === 0 ? (
                <div className="settings-rules-group-empty">{language.t("settings.rules.empty")}</div>
              ) : (
                listItems.map((rule) => {
                  const active = draft?.originalName === rule.name && draft.scope === rule.scope
                  return (
                    <div
                      key={`${rule.scope}:${rule.name}`}
                      className={`settings-rules-node settings-commands-node ${active ? "active" : ""} ${rule.enabled ? "" : "disabled"}`}
                    >
                      <button
                        type="button"
                        className="settings-rules-node-main settings-commands-node-main"
                        onClick={() => editRule(rule)}
                      >
                        <span className="settings-rules-card-name settings-commands-node-name">{rule.name}</span>
                      </button>
                      <div className="settings-commands-node-meta">
                        <span className={`settings-rules-scope-count settings-commands-scope ${rule.scope}`}>
                          {scopeLabel(rule.scope)}
                        </span>
                        <input
                          type="checkbox"
                          role="switch"
                          className="settings-toggle settings-rules-node-toggle"
                          checked={rule.enabled}
                          aria-label={language.t("settings.rules.toggle")}
                          title={rule.enabled ? language.t("settings.rules.enabled") : language.t("settings.rules.disabled")}
                          onChange={(event) => onToggleRule(rule.scope, rule.name, event.currentTarget.checked)}
                        />
                        <Button
                          variant="icon"
                          className="settings-rules-danger settings-rules-node-delete settings-commands-node-delete"
                          title={language.t("settings.rules.delete")}
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
                })
              )}
            </div>
          </div>

          <div className="settings-rules-editor settings-commands-editor">
          {draft ? (
            <>
              <div className="settings-rules-editor-header settings-commands-editor-header">
                <span className="settings-rules-editor-title">
                  {draft.originalName
                    ? language.t("settings.rules.editing", { name: draft.originalName })
                    : language.t("settings.rules.new")}
                </span>
                <div className="settings-rules-editor-actions">
                  <span className={`settings-rules-scope-count settings-commands-scope ${draft.scope}`}>{scopeLabel(draft.scope)}</span>
                </div>
              </div>
              <div className="settings-rules-editor-body">
                {!draft.originalName ? (
                  <label className="settings-rules-field">
                    <span>{language.t("settings.rules.scope.title")}</span>
                    <Select
                      value={draft.scope}
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
                            name: uniqueName(current.name, rules.filter((rule) => rule.scope === nextScope).map((rule) => rule.name)),
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
                    placeholder="my-rule"
                    onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
                  />
                  {invalidName || duplicateName ? (
                    <span className="settings-rules-error">
                      {invalidName ? language.t("settings.rules.error.name") : language.t("settings.rules.error.duplicate")}
                    </span>
                  ) : null}
                </label>

                <div className="settings-rules-tabs">
                  <button
                    type="button"
                    className={`settings-rules-tab ${editorTab === "edit" ? "active" : ""}`}
                    onClick={() => setEditorTab("edit")}
                  >
                    {language.t("settings.rules.content")}
                  </button>
                  <button
                    type="button"
                    className={`settings-rules-tab ${editorTab === "preview" ? "active" : ""}`}
                    onClick={() => setEditorTab("preview")}
                  >
                    {language.t("settings.rules.preview")}
                  </button>
                </div>

                <div className="settings-rules-editor-area">
                  {editorTab === "edit" ? (
                    <textarea
                      className="settings-rules-textarea"
                      value={draft.content}
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
                <Button variant="small" onClick={() => setDraft(undefined)}>
                  {language.t("common.cancel")}
                </Button>
                <Button variant="small" className="settings-rules-save" disabled={!canSave} onClick={save}>
                  {language.t("settings.actions.save")}
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
          onClose={() => setPendingDelete(undefined)}
          footer={
            <Button
              variant="small"
              className="settings-rules-danger"
              onClick={() => {
                onDeleteRule(pendingDelete.scope, pendingDelete.name)
                if (draft?.originalName === pendingDelete.name && draft.scope === pendingDelete.scope) setDraft(undefined)
                setPendingDelete(undefined)
              }}
            >
              {language.t("settings.rules.delete")}
            </Button>
          }
        >
          <div>{language.t("settings.rules.deleteConfirm", { name: pendingDelete.name })}</div>
        </SettingsDialog>
      ) : null}
    </>
  )
}
