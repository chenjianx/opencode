import { useState } from "react"
import type { RaccoonModel } from "../../protocol"
import { useLanguage } from "../../context/language"
import { formatModelString } from "../settings/utils"
import { Popover } from "./popover"

const providerPriority: Record<string, number> = {
  raccoon: 0,
}

function keyOf(model: { providerID: string; modelID: string }) {
  return formatModelString(model)
}

function modelParts(name: string) {
  const separator = name.indexOf(": ")
  if (separator < 0) return { name }
  return { provider: name.slice(0, separator), name: name.slice(separator + 2) }
}

function modelLabel(model: RaccoonModel) {
  return `${model.providerName || model.providerID}/${model.modelName}`
}

export function ModelPicker(props: {
  value?: { providerID: string; modelID: string }
  models: RaccoonModel[]
  onChange: (model: { providerID: string; modelID: string }) => void
  ariaLabel: string
  placeholder: string
  compact?: boolean
  placement?: "top" | "bottom"
  maxWidth?: number
  allowUnset?: boolean
  unsetLabel?: string
  onUnset?: () => void
  disabled?: boolean
  variant?: "default" | "composer"
}) {
  const language = useLanguage()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const current = props.models.find((model) => model.providerID === props.value?.providerID && model.modelID === props.value?.modelID)
  const currentLabel = current ? modelLabel(current) : props.allowUnset && !props.value ? props.unsetLabel ?? props.placeholder : props.placeholder
  const maxWidth = props.maxWidth

  const compact = props.compact ?? false
  const composer = props.variant === "composer"
  const filtered = props.models.filter((model) =>
    `${model.providerName} ${model.modelName} ${model.providerID} ${model.modelID}`.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const groups = Array.from(
    filtered
      .map((model, index) => ({ model, index }))
      .slice()
      .sort((a, b) => {
        const priority = (providerPriority[a.model.providerID] ?? 99) - (providerPriority[b.model.providerID] ?? 99)
        if (priority !== 0) return priority
        return a.index - b.index
      })
      .map((entry) => entry.model)
      .reduce((result, model) => {
        const key = model.providerID
        result.set(key, [...(result.get(key) ?? []), model])
        return result
      }, new Map<string, RaccoonModel[]>()),
)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setQuery("")
      }}
      className={
        composer
          ? "relative inline-flex min-w-0 max-w-[min(210px,52vw)] flex-none"
          : compact
            ? "relative inline-flex w-max min-w-0 max-w-full flex-none"
            : "relative w-[min(190px,46vw)] min-w-[120px] max-w-full"
      }
      menuClassName={`${composer ? "prompt-model-menu " : ""}overflow-hidden rounded-[6px] border border-[var(--color-border)] bg-[var(--color-background)] shadow-[var(--shadow-md)]`}
      portal
      placement={props.placement ?? (compact ? "top" : "bottom")}
      width={350}
      trigger={(api) => (
        <button
          type="button"
          className={`flex items-center justify-between gap-1.5 rounded-[4px] border px-2 text-left leading-none text-[var(--color-input-foreground)] cursor-pointer hover:bg-[var(--color-hover)] focus:outline focus:outline-1 focus:outline-offset-[-1px] focus:outline-[var(--color-focus)] disabled:cursor-default disabled:opacity-55 ${
            composer
              ? "h-[26px] w-max max-w-full shrink-0 border-transparent bg-transparent text-[12px]"
              : compact
                ? "h-[26px] w-max max-w-full shrink-0 border-[var(--color-border)] bg-transparent text-[12px]"
                : "min-h-[28px] border-[var(--color-border)] bg-[var(--color-input)]"
          }`}
          style={maxWidth ? { maxWidth, width: `min(${maxWidth}px, 100%)` } : undefined}
          aria-label={props.ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={api.open}
          title={composer && current ? `${current.providerName || current.providerID} / ${current.modelName}` : undefined}
          disabled={props.disabled || props.models.length === 0}
          onClick={api.toggle}
        >
          <span
            className={
              composer
                ? "flex min-w-0 items-center gap-1"
                : compact
                  ? "flex min-w-0 items-center gap-1.5"
                  : "flex min-w-0 flex-col gap-px"
            }
          >
            {composer && current ? (
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-medium text-[var(--color-foreground)]">
                {current.modelName}
              </span>
            ) : (
              <span
                className={`whitespace-nowrap text-[12px] font-medium text-[var(--color-foreground)] ${compact ? (maxWidth ? "overflow-hidden text-ellipsis" : "max-w-none") : "overflow-hidden text-ellipsis"}`}
              >
                {compact ? currentLabel : current?.modelName ?? props.placeholder}
              </span>
            )}
            {current && !compact ? (
              <span className="text-[11px] leading-tight text-[var(--color-muted)]">{current.providerID}/{current.modelID}</span>
            ) : null}
          </span>
          <span className="shrink-0 text-[11px] text-[var(--color-muted)]">▾</span>
        </button>
      )}
    >
      {(api) => (
        <div role="listbox" aria-label={props.ariaLabel}>
          <div className="border-b border-[var(--color-border)] p-2">
            <input
              className={`h-[28px] w-full rounded-[4px] border border-[var(--color-border)] bg-[var(--color-input)] px-2 text-[12px] text-[var(--color-input-foreground)] outline-none placeholder:text-[var(--color-muted)] ${composer ? "focus:border-[var(--chat-accent)]" : "focus:border-[var(--color-focus)]"}`}
              value={query}
              placeholder={language.t("modelPicker.search")}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => event.stopPropagation()}
              autoFocus
            />
          </div>
          <div className="max-h-[260px] overflow-y-auto py-1">
            {props.allowUnset ? (
              <button
                type="button"
                className={`flex w-full items-center gap-1.5 border-0 px-3 py-1.5 text-left text-[12px] cursor-pointer hover:bg-[var(--color-hover)] ${
                  !props.value ? "bg-[var(--vscode-list-activeSelectionBackground,var(--color-hover))] text-[var(--vscode-list-activeSelectionForeground,var(--color-foreground))]" : "bg-transparent text-[var(--color-foreground)]"
                }`}
                role="option"
                aria-selected={!props.value}
                onClick={() => {
                  props.onUnset?.()
                  api.close()
                  setQuery("")
                }}
              >
                <span className="overflow-hidden text-ellipsis font-semibold">{props.unsetLabel ?? props.placeholder}</span>
              </button>
            ) : null}
            {groups.length === 0 ? <div className="px-3 py-3 text-center text-[12px] text-[var(--color-muted)]">{language.t("modelPicker.empty")}</div> : null}
            {groups.map(([providerID, models]: [string, RaccoonModel[]], index) => (
              <div className={index === 0 && !props.allowUnset ? "" : "mt-1 border-t border-[var(--color-border)] pt-1"} key={providerID}>
                <div className="px-3 py-1 text-[11px] font-medium leading-4 text-[var(--color-muted)]">
                  {models[0]?.providerName ?? providerID}
                </div>
                {models.map((model: RaccoonModel) => {
                  const active = model.providerID === props.value?.providerID && model.modelID === props.value?.modelID
                  const parts = modelParts(model.modelName)
                  return (
                    <button
                      type="button"
                      className={`flex w-full items-center gap-1.5 border-0 px-3 py-1.5 text-left text-[12px] cursor-pointer hover:bg-[var(--color-hover)] ${
                        active
                          ? composer
                            ? "bg-[var(--chat-accent-soft)] text-[var(--color-foreground)]"
                            : "bg-[var(--vscode-list-activeSelectionBackground,var(--color-hover))] text-[var(--vscode-list-activeSelectionForeground,var(--color-foreground))]"
                          : "bg-transparent text-[var(--color-foreground)]"
                      }`}
                      key={keyOf(model)}
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        props.onChange({ providerID: model.providerID, modelID: model.modelID })
                        api.close()
                        setQuery("")
                      }}
                    >
                      <span className="flex min-w-0 flex-1 items-baseline gap-1 overflow-hidden whitespace-nowrap">
                        {parts.provider ? <span className="shrink-0 text-[var(--color-muted)]">{parts.provider}</span> : null}
                        <span className="overflow-hidden text-ellipsis font-semibold">{parts.name}</span>
                      </span>
                      <span className="shrink-0 text-[10px] text-[var(--color-muted)]">{model.providerID}</span>
                      {composer ? (
                        <span
                          aria-hidden="true"
                          className={`w-3 shrink-0 text-[11px] text-[var(--chat-accent)] ${active ? "" : "opacity-0"}`}
                        >
                          ✓
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </Popover>
  )
}
