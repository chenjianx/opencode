import { useEffect, useRef, type ReactNode } from "react"
import { X } from "@phosphor-icons/react"
import { useLanguage } from "../../context/language"

/**
 * Shared modal shell for the settings dialogs. Centralizes the backdrop,
 * header (title/subtitle + close button), body and footer markup, plus the
 * common dismissal behaviors:
 *  - click on the backdrop closes the dialog
 *  - the Escape key closes the dialog
 *  - focus moves into the dialog on open and is restored to the previously
 *    focused element on close
 *
 * Variant-specific classes are appended to the shared base classes, so callers
 * only pass the extra modifier (e.g. `settings-provider-connect-body`).
 */
export function SettingsDialog(props: {
  titleId: string
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  className?: string
  headerClassName?: string
  bodyClassName?: string
  footerClassName?: string
}) {
  const language = useLanguage()
  const dialogRef = useRef<HTMLDivElement>(null)
  // Keep the latest onClose without re-running the mount effect (callers often
  // pass a fresh closure each render).
  const onCloseRef = useRef(props.onClose)
  onCloseRef.current = props.onClose

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onCloseRef.current()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [])

  const onBackdropMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onCloseRef.current()
  }

  return (
    <div className="settings-dialog-backdrop" role="presentation" onMouseDown={onBackdropMouseDown}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`settings-dialog ${props.className ?? ""}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={props.titleId}
      >
        <div className={`settings-dialog-header ${props.headerClassName ?? ""}`.trim()}>
          <div>
            <div className="settings-dialog-title" id={props.titleId}>
              {props.title}
            </div>
            {props.subtitle ? <div className="settings-dialog-subtitle">{props.subtitle}</div> : null}
          </div>
          <button type="button" className="settings-dialog-icon-button" onClick={props.onClose} aria-label={language.t("common.close")}>
            <X size={14} weight="bold" />
          </button>
        </div>
        <div className={`settings-dialog-body ${props.bodyClassName ?? ""}`.trim()}>{props.children}</div>
        {props.footer ? <div className={`settings-dialog-footer ${props.footerClassName ?? ""}`.trim()}>{props.footer}</div> : null}
      </div>
    </div>
  )
}
