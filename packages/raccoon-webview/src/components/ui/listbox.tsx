import type { ReactNode, Ref } from "react"

/**
 * Shared primitives for the prompt popovers (slash-command list, file-mention
 * list, mode picker). These three popovers previously each hand-rolled an
 * identical floating panel `<div>` and an identical option `<button>` (same
 * border / shadow / hover / active-selection classes). They are extracted here
 * so the styling lives in one place.
 *
 * Note: unlike `Popover`/`ModelPicker`, the prompt popovers are *parent
 * managed* — the prompt input owns open state, keyboard navigation, the
 * selected index, and scroll-into-view via refs — so these are presentational
 * primitives, not a self-contained dropdown.
 */

/** Floating panel that anchors above the prompt input. */
const PANEL_BASE =
  "absolute bottom-[calc(100%+6px)] left-0 z-30 max-h-[220px] w-full overflow-y-auto rounded-[6px] border border-[var(--color-border)] bg-[var(--color-background)] py-1 shadow-[var(--shadow-md)]"

export function ListboxPanel(props: {
  ariaLabel: string
  containerRef?: Ref<HTMLDivElement>
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`${PANEL_BASE} ${props.className ?? ""}`.trim()}
      ref={props.containerRef}
      role="listbox"
      aria-label={props.ariaLabel}
    >
      {props.children}
    </div>
  )
}

const OPTION_BASE = "flex w-full items-center gap-2 border-0 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--color-hover)]"
const OPTION_ACTIVE =
  "bg-[var(--vscode-list-activeSelectionBackground,var(--color-hover))] text-[var(--vscode-list-activeSelectionForeground,var(--color-foreground))]"
const OPTION_INACTIVE = "bg-transparent text-[var(--color-foreground)]"

/** Single option row inside a {@link ListboxPanel}. */
export function ListboxOption(props: {
  selected: boolean
  buttonRef?: Ref<HTMLButtonElement>
  className?: string
  onHover?: () => void
  onMouseDown?: (event: React.MouseEvent<HTMLButtonElement>) => void
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      ref={props.buttonRef}
      type="button"
      className={`${OPTION_BASE} ${props.selected ? OPTION_ACTIVE : OPTION_INACTIVE} ${props.className ?? ""}`.trim()}
      role="option"
      aria-selected={props.selected}
      onMouseEnter={props.onHover}
      onMouseDown={props.onMouseDown}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}
