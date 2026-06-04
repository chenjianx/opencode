import type { RefObject } from "react"
import type { RaccoonFileSearchItem, RaccoonSlashCommand } from "../../../protocol"
import { useLanguage } from "../../../context/language"
import { dirName, fileName } from "./file-mention"
import { commandGroupLabel } from "./prompt-input-utils"

export type CommandGroup = {
  source: RaccoonSlashCommand["source"]
  items: Array<{ command: RaccoonSlashCommand; index: number }>
}

export type ModeOption = { value: string; label: string; description?: string }

export function PromptCommandList(props: {
  groups: CommandGroup[]
  selected: number
  containerRef: RefObject<HTMLDivElement | null>
  itemRefs: RefObject<Array<HTMLButtonElement | null>>
  onHover: (index: number) => void
  onSelect: (command: RaccoonSlashCommand) => void
}) {
  const { t } = useLanguage()
  return (
    <div
      className="absolute bottom-[calc(100%+6px)] left-0 z-30 max-h-[220px] w-full overflow-y-auto rounded-[6px] border border-[var(--color-border)] bg-[var(--color-background)] py-1 shadow-[var(--shadow-md)]"
      ref={props.containerRef}
      role="listbox"
      aria-label="Commands"
    >
      {props.groups.map((group, groupIndex) => (
        <div className={groupIndex === 0 ? "" : "mt-1 border-t border-[var(--color-border)] pt-1"} key={group.source}>
          <div className="px-3 py-1 text-[11px] font-medium leading-4 text-[var(--color-muted)]">
            {t(commandGroupLabel(group.source))}
          </div>
          {group.items.map((item) => (
            <button
              ref={(element) => {
                props.itemRefs.current[item.index] = element
              }}
              type="button"
              className={`flex w-full items-center gap-2 border-0 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--color-hover)] ${
                item.index === props.selected
                  ? "bg-[var(--vscode-list-activeSelectionBackground,var(--color-hover))] text-[var(--vscode-list-activeSelectionForeground,var(--color-foreground))]"
                  : "bg-transparent text-[var(--color-foreground)]"
              }`}
              key={item.command.name}
              role="option"
              aria-selected={item.index === props.selected}
              onMouseEnter={() => props.onHover(item.index)}
              onClick={() => props.onSelect(item.command)}
            >
              <span className="shrink-0 font-semibold">/{item.command.name}</span>
              {item.command.description ? (
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--color-muted)]">
                  {item.command.description}
                </span>
              ) : null}
              {item.command.aliases?.length ? (
                <span className="ml-auto shrink-0 text-[10px] text-[var(--color-muted)]">
                  {item.command.aliases.map((alias) => `/${alias}`).join(" ")}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

export function PromptMentionList(props: {
  items: RaccoonFileSearchItem[]
  selected: number
  containerRef: RefObject<HTMLDivElement | null>
  itemRefs: RefObject<Array<HTMLButtonElement | null>>
  onHover: (index: number) => void
  onSelect: (item: RaccoonFileSearchItem) => void
}) {
  return (
    <div
      className="absolute bottom-[calc(100%+6px)] left-0 z-30 max-h-[220px] w-full overflow-y-auto rounded-[6px] border border-[var(--color-border)] bg-[var(--color-background)] py-1 shadow-[var(--shadow-md)]"
      ref={props.containerRef}
      role="listbox"
      aria-label="File mentions"
    >
      {props.items.map((item, index) => {
        const directory =
          item.type === "file" || item.type === "folder" || item.type === "opened-file" ? dirName(item.path) : ""
        return (
          <button
            ref={(element) => {
              props.itemRefs.current[index] = element
            }}
            type="button"
            className={`flex w-full items-center gap-2 border-0 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--color-hover)] ${
              index === props.selected
                ? "bg-[var(--vscode-list-activeSelectionBackground,var(--color-hover))] text-[var(--vscode-list-activeSelectionForeground,var(--color-foreground))]"
                : "bg-transparent text-[var(--color-foreground)]"
            }`}
            key={`${item.type}:${item.path}`}
            role="option"
            aria-selected={index === props.selected}
            onMouseEnter={() => props.onHover(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => props.onSelect(item)}
          >
            {item.type === "terminal" ||
            item.type === "git-changes" ||
            item.type === "file-group" ||
            item.type === "folder-group" ? (
              <>
                <span className="min-w-0 shrink overflow-hidden text-ellipsis whitespace-nowrap font-semibold">
                  @{item.path}
                </span>
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--color-muted)]">
                  {item.description}
                </span>
              </>
            ) : (
              <>
                <span className="min-w-0 shrink overflow-hidden text-ellipsis whitespace-nowrap font-semibold">
                  {item.type === "folder" ? `${fileName(item.path)}/` : fileName(item.path)}
                </span>
                {directory ? (
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--color-muted)]">
                    {directory}
                  </span>
                ) : null}
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function PromptModePicker(props: {
  options: ModeOption[]
  current: ModeOption
  mode: string
  open: boolean
  containerRef: RefObject<HTMLDivElement | null>
  onToggle: () => void
  onSelect: (value: string) => void
}) {
  const { t } = useLanguage()
  return (
    <div className="relative inline-flex w-max flex-none" ref={props.containerRef}>
      <button
        type="button"
        className="flex h-[26px] w-max items-center justify-between gap-1.5 rounded-[4px] border border-[var(--color-border)] bg-transparent px-2 text-left text-[12px] leading-none text-[var(--color-foreground)] hover:bg-[var(--color-hover)] focus:outline focus:outline-1 focus:outline-offset-[-1px] focus:outline-[var(--color-focus)]"
        aria-label={t("prompt.mode")}
        aria-haspopup="listbox"
        aria-expanded={props.open}
        onClick={props.onToggle}
      >
        <span className="whitespace-nowrap font-medium">{props.current?.label ?? t("prompt.mode")}</span>
        <span className="shrink-0 text-[11px] text-[var(--color-muted)]">▾</span>
      </button>
      {props.open ? (
        <div
          className="absolute bottom-[calc(100%+4px)] left-0 z-30 w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-[6px] border border-[var(--color-border)] bg-[var(--color-background)] py-1 shadow-[var(--shadow-md)]"
          role="listbox"
          aria-label={t("prompt.mode")}
        >
          {props.options.map((mode) => {
            const active = mode.value === props.mode
            return (
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-4 border-0 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--color-hover)] ${
                  active
                    ? "bg-[var(--vscode-list-activeSelectionBackground,var(--color-hover))] text-[var(--vscode-list-activeSelectionForeground,var(--color-foreground))]"
                    : "bg-transparent text-[var(--color-foreground)]"
                }`}
                key={mode.value}
                role="option"
                aria-selected={active}
                onClick={() => props.onSelect(mode.value)}
              >
                <span className="min-w-0">
                  <span className="block font-medium">{mode.label}</span>
                  {mode.description ? (
                    <span className="mt-0.5 block max-w-[260px] whitespace-normal text-[11px] leading-[14px] text-[var(--color-muted)]">
                      {mode.description}
                    </span>
                  ) : null}
                </span>
                {active ? <span className="text-[11px] text-[var(--color-muted)]">✓</span> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
