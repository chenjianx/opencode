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
