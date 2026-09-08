import { CaretDown, Check } from "@phosphor-icons/react"
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { Popover } from "./popover"

export function SettingsRow(props: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <div className="settings-row-title">{props.title}</div>
        {props.description ? <div className="settings-row-description">{props.description}</div> : null}
      </div>
      <div className="settings-row-control">{props.children}</div>
    </div>
  )
}

/** Styled text input that exposes the value (not the raw event) via onChange. */
export function TextInput(props: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: "text" | "password"
  disabled?: boolean
  className?: string
  ariaLabel?: string
}) {
  return (
    <input
      className={props.className ?? "settings-provider-input"}
      type={props.type ?? "text"}
      value={props.value}
      placeholder={props.placeholder}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    />
  )
}

/** Styled multiline text input that exposes the value (not the raw event) via onChange. */
export function Textarea(props: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  rows?: number
  className?: string
  ariaLabel?: string
}) {
  return (
    <textarea
      className={props.className ?? "ui-textarea"}
      value={props.value}
      placeholder={props.placeholder}
      disabled={props.disabled}
      rows={props.rows}
      aria-label={props.ariaLabel}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    />
  )
}

/** Labeled text field: `<label><span/><input/><small/></label>` used across the settings dialogs. */
export function TextField(props: {
  label?: ReactNode
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: "text" | "password"
  disabled?: boolean
  help?: ReactNode
  className?: string
}) {
  return (
    <label className={`settings-dialog-field ${props.className ?? ""}`.trim()}>
      {props.label ? <span>{props.label}</span> : null}
      <TextInput
        value={props.value}
        onChange={props.onChange}
        placeholder={props.placeholder}
        type={props.type}
        disabled={props.disabled}
      />
      {props.help ? <small>{props.help}</small> : null}
    </label>
  )
}

/** Styled in-app select that exposes the selected value via onChange. */
export function Select(props: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
  disabled?: boolean
  className?: string
  contentWidth?: boolean
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listboxID = useId()
  const options =
    props.placeholder === undefined ? props.options : [{ value: "", label: props.placeholder }, ...props.options]
  const selectedIndex = options.findIndex((option) => option.value === props.value)
  const selectedLabel = selectedIndex >= 0 ? (options[selectedIndex]?.label ?? props.value) : props.value

  useEffect(() => {
    if (!open) return
    optionRefs.current[activeIndex]?.focus()
  }, [activeIndex, open])

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (next) setActiveIndex(Math.max(selectedIndex, 0))
  }

  const moveActive = (event: KeyboardEvent, index: number) => {
    event.preventDefault()
    if (options.length === 0) return
    setActiveIndex((index + options.length) % options.length)
  }

  const closeAndFocus = () => {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const moveFocusFromTrigger = (backward: boolean) => {
    const trigger = triggerRef.current
    if (!trigger) return
    const scope = trigger.closest<HTMLElement>('[role="dialog"][aria-modal="true"]') ?? document.body
    const focusable = Array.from(
      scope.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !optionRefs.current.includes(element as HTMLButtonElement))
    const index = focusable.indexOf(trigger)
    focusable[index + (backward ? -1 : 1)]?.focus()
  }

  const selectValue = (value: string) => {
    if (value !== props.value) props.onChange(value)
    closeAndFocus()
  }

  return (
    <Popover
      open={open}
      onOpenChange={changeOpen}
      className={`settings-select-root ${props.contentWidth ? "settings-select-content-width" : ""}`.trim()}
      menuClassName="settings-select-menu"
      portal
      placement="auto"
      trigger={(api) => (
        <>
          <button
            ref={triggerRef}
            type="button"
            className={`settings-select-trigger ${props.className ?? "settings-provider-input"} ${api.open ? "open" : ""}`.trim()}
            disabled={props.disabled}
            aria-label={props.ariaLabel ? `${props.ariaLabel}: ${selectedLabel}` : undefined}
            aria-haspopup="listbox"
            aria-expanded={api.open}
            aria-controls={listboxID}
            onClick={api.toggle}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
              moveActive(event, selectedIndex)
              changeOpen(true)
            }}
          >
            <span className="settings-select-value">{selectedLabel}</span>
            <CaretDown className="settings-select-caret" size={13} weight="bold" aria-hidden="true" />
          </button>
          {props.contentWidth ? (
            <span className="settings-select-sizer" aria-hidden="true">
              {options.map((option) => (
                <span className="settings-select-sizer-option" key={option.value}>
                  <span>{option.label}</span>
                  <span className="settings-select-sizer-caret" />
                </span>
              ))}
            </span>
          ) : null}
        </>
      )}
    >
      {() => (
        <div
          id={listboxID}
          role="listbox"
          aria-label={props.ariaLabel}
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              event.preventDefault()
              setOpen(false)
              moveFocusFromTrigger(event.shiftKey)
              return
            }
            if (event.key === "Escape") {
              event.preventDefault()
              event.stopPropagation()
              closeAndFocus()
              return
            }
            if (event.key === "ArrowDown") moveActive(event, activeIndex + 1)
            if (event.key === "ArrowUp") moveActive(event, activeIndex - 1)
            if (event.key === "Home") moveActive(event, 0)
            if (event.key === "End") moveActive(event, options.length - 1)
            if (event.key !== "Enter" && event.key !== " ") return
            event.preventDefault()
            const option = options[activeIndex]
            if (option) selectValue(option.value)
          }}
        >
          {options.map((option, index) => {
            const selected = option.value === props.value
            return (
              <button
                type="button"
                className={`settings-select-option ${selected ? "selected" : ""}`.trim()}
                role="option"
                aria-selected={selected}
                tabIndex={index === activeIndex ? 0 : -1}
                ref={(element) => {
                  optionRefs.current[index] = element
                }}
                key={option.value}
                onFocus={() => setActiveIndex(index)}
                onClick={() => selectValue(option.value)}
              >
                <span>{option.label}</span>
                <Check className={selected ? "" : "invisible"} size={13} weight="bold" aria-hidden="true" />
              </button>
            )
          })}
        </div>
      )}
    </Popover>
  )
}

/** Labeled select field mirroring TextField. Exposes the selected value via onChange. */
export function SelectField(props: {
  label: ReactNode
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <label className={`settings-dialog-field ${props.className ?? ""}`.trim()}>
      <span>{props.label}</span>
      <Select
        value={props.value}
        onChange={props.onChange}
        options={props.options}
        placeholder={props.placeholder}
        disabled={props.disabled}
        ariaLabel={typeof props.label === "string" ? props.label : undefined}
      />
    </label>
  )
}
