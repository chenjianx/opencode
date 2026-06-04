import { useEffect, useMemo, useState } from "react"
import { Plus, Trash } from "@phosphor-icons/react"
import type { RaccoonAgentScope, RaccoonRule } from "../../protocol"
import { useLanguage } from "../../context/language"
import { useSession } from "../../context/session"
import { SettingsDialog } from "./settings-dialog"
import { MarkdownLite } from "../ui/markdown-lite"

const SCOPES: RaccoonAgentScope[] = ["project", "user"]
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

type RuleDraft = {
  scope: RaccoonAgentScope
  originalName: string // "" when creating
  name: string
  content: string
}

function firstLine(content: string): string {
  for (const raw of content.split("\n")) {
    const line = raw.replace(/^#+\s*/, "").trim()
    if (line) return line
  }
  return ""
}

function uniqueName(base: string, existing: RaccoonRule[]): string {
  const names = new Set(existing.map((rule) => rule.name))
  return (
    Array.from({ length: 100 }, (_, index) => (index === 0 ? base : `${base}-${index + 1}`)).find(
      (candidate) => !names.has(candidate),
    ) ?? base
  )
}

export function SettingsRules(props: {
  rules: RaccoonRule[]
  onSaveRule: (scope: RaccoonAgentScope, originalName: string, name: string, content: string) => void
  onToggleRule: (scope: RaccoonAgentScope, name: string, enabled: boolean) => void
  onDeleteRule: (scope: RaccoonAgentScope, name: string) => void
}) {
  const language = useLanguage()
  const session = useSession()
  const { rules, onSaveRule, onToggleRule, onDeleteRule } = props
  const [draft, setDraft] = useState<RuleDraft | undefined>()
  const [editorTab, setEditorTab] = useState<"edit" | "preview">("edit")
  const [pendingDelete, setPendingDelete] = useState<RaccoonRule | undefined>()

  const grouped = useMemo(
    () => ({
      project: rules.filter((rule) => rule.scope === "project"),
      user: rules.filter((rule) => rule.scope === "user"),
    }),
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
    !!draft && grouped[draft.scope].some((rule) => rule.name === trimmedName && rule.name !== draft.originalName)
  const canSave = !!draft && !invalidName && !duplicateName

  const editRule = (rule: RaccoonRule) => {
    setEditorTab("edit")
    setDraft({ scope: rule.scope, originalName: rule.name, name: rule.name, content: rule.content })
  }
  const createRule = (scope: RaccoonAgentScope) => {
    setEditorTab("edit")
    setDraft({ scope, originalName: "", name: uniqueName("new-rule", grouped[scope]), content: "" })
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
      <div className="settings-rules-root">
        <h3>{language.t("settings.nav.rules")}</h3>
        <div className="settings-rules-hint settings-rules-intro">{language.t("settings.rules.subtitle")}</div>

        <div className="settings-rules-shell">
        <div className="settings-rules-pane">
          <div className="settings-rules-tree">
            {SCOPES.map((scope) => {
              const scopeRules = grouped[scope]
              return (
                <div className="settings-rules-group" key={scope}>
                  <div className="settings-rules-group-header">
                    <div className="settings-rules-group-toggle">
                      <span className="settings-rules-group-label">{scopeLabel(scope)}</span>
                      <span className="settings-rules-count">{scopeRules.length}</span>
                    </div>
                    <button
                      type="button"
                      className="settings-icon-button settings-rules-add"
                      title={language.t("settings.rules.new")}
                      onClick={() => createRule(scope)}
                    >
                      <Plus size={15} weight="bold" />
                    </button>
                  </div>

                  <div className="settings-rules-children">
                    {scopeRules.length === 0 ? (
                      <div className="settings-rules-group-empty">{language.t("settings.rules.empty")}</div>
                    ) : (
                      scopeRules.map((rule) => {
                        const active = draft?.originalName === rule.name && draft.scope === rule.scope
                        return (
                          <div
                            key={rule.name}
                            className={`settings-rules-node ${active ? "active" : ""} ${rule.enabled ? "" : "disabled"}`}
                          >
                            <button
                              type="button"
                              className="settings-icon-button settings-rules-danger settings-rules-node-delete"
                              title={language.t("settings.rules.delete")}
                              onClick={() => setPendingDelete(rule)}
                            >
                              <Trash size={14} />
                            </button>
                            <button type="button" className="settings-rules-node-main" onClick={() => editRule(rule)}>
                              <span className="settings-rules-card-name">{rule.name}</span>
                            </button>
                            <input
                              type="checkbox"
                              role="switch"
                              className="settings-toggle settings-rules-node-toggle"
                              checked={rule.enabled}
                              aria-label={language.t("settings.rules.toggle")}
                              title={rule.enabled ? language.t("settings.rules.enabled") : language.t("settings.rules.disabled")}
                              onChange={(event) => onToggleRule(rule.scope, rule.name, event.currentTarget.checked)}
                            />
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
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
                  <span className="settings-rules-scope-count">{scopeLabel(draft.scope)}</span>
                </div>
              </div>
              <div className="settings-rules-editor-body">
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
                        <MarkdownLite text={draft.content} onOpenFile={session.openFile} />
                      ) : (
                        <div className="settings-rules-hint">{language.t("settings.rules.preview.empty")}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="settings-rules-editor-footer">
                <button type="button" className="settings-small-button" onClick={() => setDraft(undefined)}>
                  {language.t("common.cancel")}
                </button>
                <button type="button" className="settings-small-button settings-rules-save" disabled={!canSave} onClick={save}>
                  {language.t("settings.actions.save")}
                </button>
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
            <button
              type="button"
              className="settings-small-button settings-rules-danger"
              onClick={() => {
                onDeleteRule(pendingDelete.scope, pendingDelete.name)
                if (draft?.originalName === pendingDelete.name && draft.scope === pendingDelete.scope) setDraft(undefined)
                setPendingDelete(undefined)
              }}
            >
              {language.t("settings.rules.delete")}
            </button>
          }
        >
          <div>{language.t("settings.rules.deleteConfirm", { name: pendingDelete.name })}</div>
        </SettingsDialog>
      ) : null}
    </>
  )
}
