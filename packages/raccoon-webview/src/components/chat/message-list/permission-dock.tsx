import { useMemo, useState } from "react"
import { FolderOpen, Globe, PencilSimple, ShieldWarning, Terminal } from "@phosphor-icons/react"
import { useLanguage } from "../../../context/language"
import { useSession } from "../../../context/session"
import type { RaccoonMessagePart, RaccoonPermissionRequest } from "../../../protocol"
import { DiffPanel, diffFiles } from "./message-list-diff"
import { filename } from "./message-list-format"

type Translate = ReturnType<typeof useLanguage>["t"]

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value
  return undefined
}

function permissionMeta(request: RaccoonPermissionRequest, t: Translate) {
  switch (request.permission) {
    case "edit":
      return { icon: PencilSimple, label: t("permission.action.edit") }
    case "bash":
      return { icon: Terminal, label: t("permission.action.bash") }
    case "webfetch":
      return { icon: Globe, label: t("permission.action.webfetch") }
    case "external_directory":
      return { icon: FolderOpen, label: t("permission.action.externalDirectory") }
    default:
      return { icon: ShieldWarning, label: request.permission }
  }
}

export function PermissionDock(props: { request: RaccoonPermissionRequest; remaining?: number }) {
  const session = useSession()
  const language = useLanguage()
  const [sending, setSending] = useState(false)

  const request = props.request
  const remaining = props.remaining ?? 0
  const metadata = request.metadata ?? {}
  const filepath = asString(metadata.filepath) ?? asString(metadata.filePath) ?? asString(metadata.path)
  const directories =
    Array.isArray(metadata.directories)
      ? metadata.directories.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : []
  const externalDisplayPath =
    request.permission === "external_directory"
      ? asString(metadata.parentDir) ?? filepath ?? directories[0]
      : undefined
  const externalDisplayTitle =
    request.permission === "external_directory"
      ? directories.length > 0
        ? directories.join("\n")
        : (asString(metadata.parentDir) ?? filepath ?? undefined)
      : undefined
  const diff = asString(metadata.diff)
  const url = asString(metadata.url)
  const errored = session.permissionErrors.has(request.id)
  const busy = sending && !errored

  const meta = permissionMeta(request, language.t)
  const Icon = meta.icon

  const diffList = useMemo(() => {
    if (!diff) return []
    return diffFiles({ metadata: { diff, filepath }, input: { filePath: filepath } } as unknown as RaccoonMessagePart)
  }, [diff, filepath])

  // bash & generic rules carry no metadata — the actual commands/globs live in patterns.
  const commands = !diff && !url && !filepath && !externalDisplayPath ? request.patterns.filter((item) => item && item !== "*") : []

  const reply = (value: "once" | "always" | "reject") => {
    if (busy) return
    setSending(true)
    session.replyToPermission(request.id, value)
  }

  return (
    <div className="permission-dock" onClick={(event) => event.stopPropagation()}>
      <div className="permission-dock-head">
        <span className="permission-dock-icon">
          <Icon size={14} weight="regular" />
        </span>
        <div className="permission-dock-headings">
          <div className="permission-dock-title">
            <span className="permission-dock-title-text">{meta.label}</span>
            {remaining > 0 ? (
              <span className="permission-dock-queue">{language.t("permission.remaining", { count: remaining })}</span>
            ) : null}
          </div>
          {externalDisplayPath ? (
            <button
              type="button"
              className="permission-dock-subtitle"
              title={externalDisplayTitle ?? externalDisplayPath}
              onClick={() => session.openFile(externalDisplayPath)}
            >
              {externalDisplayPath}
            </button>
          ) : filepath ? (
            <button
              type="button"
              className="permission-dock-subtitle"
              title={filepath}
              onClick={() => session.openFile(filepath)}
            >
              {filename(filepath)}
            </button>
          ) : null}
        </div>
      </div>

      <div className="permission-dock-body">
        {diffList.length > 0 ? <DiffPanel files={diffList} /> : null}
        {url ? (
          <a className="permission-dock-url" href={url} target="_blank" rel="noreferrer" title={url}>
            {url}
          </a>
        ) : null}
        {commands.length > 0 ? (
          <pre className="permission-dock-command">
            {commands.map((command) => (
              <code key={command} className="permission-dock-command-line">
                {command}
              </code>
            ))}
          </pre>
        ) : null}
      </div>

      {errored ? <div className="permission-dock-error">{language.t("permission.error")}</div> : null}

      <div className="permission-dock-footer">
        <button type="button" className="permission-dock-btn permission-dock-reject" onClick={() => reply("reject")} disabled={busy}>
          {language.t("permission.reject")}
        </button>
        <div className="permission-dock-footer-actions">
          <button type="button" className="permission-dock-btn permission-dock-always" onClick={() => reply("always")} disabled={busy}>
            {language.t("permission.allowAlways")}
          </button>
          <button type="button" className="permission-dock-btn permission-dock-once" onClick={() => reply("once")} disabled={busy}>
            {language.t("permission.allowOnce")}
          </button>
        </div>
      </div>
    </div>
  )
}
