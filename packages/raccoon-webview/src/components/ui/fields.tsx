import type { ReactNode } from "react"

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

/** Styled select that exposes the selected value (not the raw event) via onChange. */
export function Select(props: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
  disabled?: boolean
  className?: string
  ariaLabel?: string
}) {
  return (
    <select
      className={props.className ?? "settings-provider-input"}
      value={props.value}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    >
      {props.placeholder !== undefined ? <option value="">{props.placeholder}</option> : null}
      {props.options.map((option) => (
        <option value={option.value} key={option.value}>
          {option.label}
        </option>
      ))}
    </select>
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
      <Select value={props.value} onChange={props.onChange} options={props.options} placeholder={props.placeholder} disabled={props.disabled} />
    </label>
  )
}
