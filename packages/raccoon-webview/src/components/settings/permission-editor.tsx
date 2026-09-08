import { useEffect, useMemo, useRef, useState } from "react"
import { CaretRight, Check, Copy, Plus, X } from "@phosphor-icons/react"
import { useLanguage } from "../../context/language"
import type { I18nKey } from "../../i18n/en"
import type { RaccoonPermissionAction, RaccoonPermissionConfig, RaccoonPermissionRule } from "../../protocol"
import { SettingsRow } from "./settings-common"
import { Button, Select } from "../ui"
import { titleCase } from "./utils"
import {
  addExceptionPatch,
  clearGroupedPatch,
  clearWildcardPatch,
  effectiveRuleLevel,
  inheritedWildcard,
  mostRestrictive,
  type PermissionPatch,
  type PermissionRuleValue,
  permissionExceptions,
  removeExceptionPatch,
  setExceptionPatch,
  setGroupedPatch,
  setWildcardPatch,
  wildcardAction,
} from "./permission-utils"

type LevelValue = RaccoonPermissionAction | "inherit"

const LEVEL_OPTIONS: { value: RaccoonPermissionAction; labelKey: I18nKey }[] = [
  { value: "allow", labelKey: "settings.agents.permission.allow" },
  { value: "ask", labelKey: "settings.agents.permission.ask" },
  { value: "deny", labelKey: "settings.agents.permission.deny" },
]

type GranularConfig = { wildcardKey: I18nKey; addKey: I18nKey; placeholderKey: I18nKey }
type ToolDef = { id: string; descriptionKey: I18nKey }
type GranularToolDef = ToolDef & { granular: GranularConfig }
type GroupedToolDef = { ids: string[]; label: string; descriptionKey: I18nKey }

const PATH_GRANULAR: GranularConfig = {
  wildcardKey: "settings.agents.permissions.wildcard.paths",
  addKey: "settings.agents.permissions.addPath",
  placeholderKey: "settings.agents.permissions.placeholder.path",
}
const COMMAND_GRANULAR: GranularConfig = {
  wildcardKey: "settings.agents.permissions.wildcard.commands",
  addKey: "settings.agents.permissions.addCommand",
  placeholderKey: "settings.agents.permissions.placeholder.command",
}

const GRANULAR_TOOLS: GranularToolDef[] = [
  { id: "external_directory", descriptionKey: "settings.agents.tool.external_directory", granular: PATH_GRANULAR },
  { id: "bash", descriptionKey: "settings.agents.tool.bash", granular: COMMAND_GRANULAR },
  { id: "read", descriptionKey: "settings.agents.tool.read", granular: PATH_GRANULAR },
  { id: "edit", descriptionKey: "settings.agents.tool.edit", granular: PATH_GRANULAR },
]

const SIMPLE_TOOLS: ToolDef[] = [
  { id: "glob", descriptionKey: "settings.agents.tool.glob" },
  { id: "grep", descriptionKey: "settings.agents.tool.grep" },
  { id: "list", descriptionKey: "settings.agents.tool.list" },
  { id: "task", descriptionKey: "settings.agents.tool.task" },
  { id: "skill", descriptionKey: "settings.agents.tool.skill" },
  { id: "lsp", descriptionKey: "settings.agents.tool.lsp" },
]

const GROUPED_TOOLS: GroupedToolDef[] = [
  { ids: ["todoread", "todowrite"], label: "todoread / todowrite", descriptionKey: "settings.agents.tool.todo" },
]

const TRAILING_TOOLS: ToolDef[] = [
  { id: "webfetch", descriptionKey: "settings.agents.tool.webfetch" },
  { id: "websearch", descriptionKey: "settings.agents.tool.websearch" },
  { id: "question", descriptionKey: "settings.agents.tool.question" },
  { id: "plan_enter", descriptionKey: "settings.agents.tool.plan_enter" },
  { id: "plan_exit", descriptionKey: "settings.agents.tool.plan_exit" },
]

function toolTitle(id: string): string {
  return titleCase(id)
}

export function PermissionEditor(props: {
  permission?: RaccoonPermissionConfig
  rules?: RaccoonPermissionRule[]
  inherited?: boolean
  onChange: (patch: PermissionPatch) => void
}) {
  const language = useLanguage()
  const perms = props.permission ?? {}

  const ruleFor = (tool: string): PermissionRuleValue | undefined => perms[tool]
  const levelFor = (tool: string): RaccoonPermissionAction =>
    wildcardAction(perms[tool], effectiveRuleLevel(props.rules, tool))

  return (
    <div>
      <div className="px-3 pt-2 pb-1 text-[11px] text-[var(--color-muted)]">{language.t("settings.agents.permissions.inheritNote")}</div>

      {GRANULAR_TOOLS.map((tool) => (
        <GranularToolRow
          key={tool.id}
          tool={tool}
          rule={ruleFor(tool.id)}
          fallback={levelFor(tool.id)}
          inherited={props.inherited && inheritedWildcard(ruleFor(tool.id))}
          allowInherit={props.inherited}
          onWildcardChange={(level) => props.onChange(setWildcardPatch(ruleFor(tool.id), tool.id, level))}
          onWildcardInherit={() => props.onChange(clearWildcardPatch(ruleFor(tool.id), tool.id))}
          onExceptionChange={(pattern, level) => props.onChange(setExceptionPatch(ruleFor(tool.id), tool.id, pattern, level))}
          onExceptionAdd={(pattern) => props.onChange(addExceptionPatch(ruleFor(tool.id), tool.id, pattern))}
          onExceptionRemove={(pattern) => {
            const patch = removeExceptionPatch(ruleFor(tool.id), tool.id, pattern)
            if (patch) props.onChange(patch)
          }}
        />
      ))}

      {SIMPLE_TOOLS.map((tool) => (
        <SimpleToolRow
          key={tool.id}
          id={tool.id}
          descriptionKey={tool.descriptionKey}
          level={levelFor(tool.id)}
          inherited={props.inherited && ruleFor(tool.id) === undefined}
          onChange={(level) => props.onChange({ [tool.id]: level })}
          onInherit={props.inherited ? () => props.onChange({ [tool.id]: null }) : undefined}
        />
      ))}

      {GROUPED_TOOLS.map((group) => (
        <SimpleToolRow
          key={group.label}
          id={group.label}
          descriptionKey={group.descriptionKey}
          level={mostRestrictive(group.ids.map(levelFor))}
          inherited={props.inherited && group.ids.every((id) => ruleFor(id) === undefined)}
          onChange={(level) => props.onChange(setGroupedPatch(group.ids, level))}
          onInherit={props.inherited ? () => props.onChange(clearGroupedPatch(group.ids)) : undefined}
        />
      ))}

      {TRAILING_TOOLS.map((tool) => (
        <SimpleToolRow
          key={tool.id}
          id={tool.id}
          descriptionKey={tool.descriptionKey}
          level={levelFor(tool.id)}
          inherited={props.inherited && ruleFor(tool.id) === undefined}
          onChange={(level) => props.onChange({ [tool.id]: level })}
          onInherit={props.inherited ? () => props.onChange({ [tool.id]: null }) : undefined}
        />
      ))}
    </div>
  )
}

function ActionSelect(props: {
  level: RaccoonPermissionAction
  ariaLabel: string
  inherited?: boolean
  onChange: (level: RaccoonPermissionAction) => void
  onInherit?: () => void
}) {
  const language = useLanguage()
  const value: LevelValue = props.inherited ? "inherit" : props.level
  return (
    <Select
      className="settings-select"
      contentWidth
      value={value}
      ariaLabel={props.ariaLabel}
      options={[
        ...(props.onInherit ? [{ value: "inherit", label: language.t("common.default") }] : []),
        ...LEVEL_OPTIONS.map((option) => ({ value: option.value, label: language.t(option.labelKey) })),
      ]}
      onChange={(value) => {
        const next = value as LevelValue
        if (next === "inherit") props.onInherit?.()
        else props.onChange(next)
      }}
    />
  )
}

function SimpleToolRow(props: {
  id: string
  descriptionKey: I18nKey
  level: RaccoonPermissionAction
  inherited?: boolean
  onChange: (level: RaccoonPermissionAction) => void
  onInherit?: () => void
}) {
  const language = useLanguage()
  return (
    <SettingsRow title={toolTitle(props.id)} description={language.t(props.descriptionKey)}>
      <ActionSelect
        level={props.level}
        ariaLabel={`${toolTitle(props.id)}: ${language.t("settings.agents.permissions.title")}`}
        inherited={props.inherited}
        onChange={props.onChange}
        onInherit={props.onInherit}
      />
    </SettingsRow>
  )
}

function GranularToolRow(props: {
  tool: GranularToolDef
  rule: PermissionRuleValue | undefined
  fallback: RaccoonPermissionAction
  inherited?: boolean
  allowInherit?: boolean
  onWildcardChange: (level: RaccoonPermissionAction) => void
  onWildcardInherit: () => void
  onExceptionChange: (pattern: string, level: RaccoonPermissionAction) => void
  onExceptionAdd: (pattern: string) => void
  onExceptionRemove: (pattern: string) => void
}) {
  const language = useLanguage()
  const [adding, setAdding] = useState(false)
  const [input, setInput] = useState("")
  const [override, setOverride] = useState<boolean | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  const excs = useMemo(() => permissionExceptions(props.rule), [props.rule])
  const expanded = override ?? excs.length <= 5
  const level = wildcardAction(props.rule, props.fallback)

  useEffect(() => {
    if (adding) ref.current?.focus()
  }, [adding])

  const submit = () => {
    const val = input.trim()
    if (val) {
      props.onExceptionAdd(val)
      setInput("")
    }
    setAdding(false)
  }
  const cancel = () => {
    setInput("")
    setAdding(false)
  }

  return (
    <SettingsRow title={toolTitle(props.tool.id)} description={language.t(props.tool.descriptionKey)}>
      <div className="flex w-full flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <ActionSelect
            level={level}
            ariaLabel={`${toolTitle(props.tool.id)}: ${language.t(props.tool.granular.wildcardKey)}`}
            inherited={props.inherited}
            onChange={props.onWildcardChange}
            onInherit={props.allowInherit ? props.onWildcardInherit : undefined}
          />
          <span className="text-[11px] text-[var(--color-muted)]">{language.t(props.tool.granular.wildcardKey)}</span>
        </div>

        {excs.length > 0 ? (
          <div>
            <button
              type="button"
              className="mb-1 flex items-center gap-1 border-none bg-transparent p-0 text-[11px] text-[var(--color-muted)]"
              onClick={() => setOverride(!expanded)}
              aria-expanded={expanded}
            >
              <span className="inline-flex items-center transition-transform" style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                <CaretRight size={11} weight="bold" />
              </span>
              <span>
                {language.t("settings.agents.permissions.exceptions")} ({excs.length})
              </span>
            </button>
            {expanded
              ? excs.map((exc) => (
                  <div key={exc.pattern} className="flex items-center gap-2 border-t border-[var(--color-border)] py-1 pl-3">
                    <div className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--color-foreground)]" title={exc.pattern}>
                      {exc.pattern}
                    </div>
                    <ActionSelect
                      level={exc.action}
                      ariaLabel={`${toolTitle(props.tool.id)}: ${exc.pattern}`}
                      onChange={(lvl) => props.onExceptionChange(exc.pattern, lvl)}
                    />
                    <Button variant="icon" title={language.t("settings.agents.permissions.remove")} onClick={() => props.onExceptionRemove(exc.pattern)}>
                      <X size={12} weight="bold" />
                    </Button>
                  </div>
                ))
              : null}
          </div>
        ) : null}

        {adding ? (
          <div className="flex items-center gap-2">
            <input
              ref={ref}
              type="text"
              className="settings-provider-input min-w-0 flex-1 font-mono"
              value={input}
              onChange={(event) => setInput(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit()
                if (event.key === "Escape") cancel()
              }}
              onBlur={() => {
                if (!input.trim()) cancel()
              }}
              placeholder={language.t(props.tool.granular.placeholderKey)}
            />
            <Button variant="icon" title={language.t("common.cancel")} onClick={cancel}>
              <X size={12} weight="bold" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="flex items-center gap-1 border-none bg-transparent p-0 text-[11px] text-[var(--color-link,#3794ff)]"
            onClick={() => setAdding(true)}
          >
            <Plus size={12} weight="bold" />
            {language.t(props.tool.granular.addKey)}
          </button>
        )}
      </div>
    </SettingsRow>
  )
}

const ACTION_BADGE: Record<RaccoonPermissionAction, string> = {
  allow: "var(--vscode-terminal-ansiGreen, #3fb950)",
  ask: "var(--vscode-editorWarning-foreground, #cca700)",
  deny: "var(--vscode-errorForeground, #f85149)",
}

export function PermissionRuleset(props: { agent: string; rules: RaccoonPermissionRule[] }) {
  const language = useLanguage()
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const summary = useMemo(() => {
    const tools = new Map<string, RaccoonPermissionAction>()
    for (const rule of props.rules) {
      if (rule.pattern === "*") tools.set(rule.permission, rule.action)
    }
    return [...tools.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [props.rules])

  const copy = (event: React.MouseEvent) => {
    event.stopPropagation()
    void navigator.clipboard?.writeText(JSON.stringify({ agent: props.agent, rules: props.rules }, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-3 border-t border-[var(--color-border)] px-3 py-3">
      <div className="flex cursor-pointer select-none items-center" onClick={() => setExpanded((value) => !value)}>
        <span className="inline-flex items-center transition-transform" style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>
          <CaretRight size={12} weight="bold" />
        </span>
        <span className="ml-1 text-[12px] font-medium text-[var(--color-foreground)]">{language.t("settings.agents.permissions.calculated")}</span>
        <span className="ml-2 text-[11px] text-[var(--color-muted)]">{language.t("settings.agents.permissions.count", { count: props.rules.length })}</span>
        <Button variant="icon" className="ml-auto" title={language.t("settings.agents.permissions.copy")} onClick={copy}>
          {copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="bold" />}
        </Button>
      </div>

      {expanded ? (
        <div className="mt-2">
          {summary.length > 0 ? (
            <div className="mb-2">
              <div className="mb-1 text-[11px] text-[var(--color-muted)]">{language.t("settings.agents.permissions.effective")}</div>
              <div className="flex flex-wrap gap-1">
                {summary.map(([tool, action]) => (
                  <span
                    key={tool}
                    className="rounded-[3px] px-1.5 py-0.5 text-[10px]"
                    style={{ background: ACTION_BADGE[action], color: "var(--vscode-editor-background, #1e1e1e)" }}
                    title={action}
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <div className="overflow-hidden rounded-[4px] border border-[var(--color-border)]">
            {props.rules.map((rule, index) => (
              <div
                key={`${rule.permission}:${rule.pattern}:${index}`}
                className="grid grid-cols-[1fr_1fr_72px] items-center gap-2 border-b border-[var(--color-border)] px-2 py-1 text-[11px] last:border-b-0"
              >
                <div className="truncate text-[var(--color-foreground)]">{rule.permission}</div>
                <div className="truncate font-mono text-[var(--color-muted)]" title={rule.pattern}>
                  {rule.pattern}
                </div>
                <div className="text-right" style={{ color: ACTION_BADGE[rule.action] }}>
                  {rule.action}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
