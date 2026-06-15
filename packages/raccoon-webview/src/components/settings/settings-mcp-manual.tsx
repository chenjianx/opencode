import { useEffect, useMemo, useState } from "react"
import { CheckCircle, Plus, X } from "@phosphor-icons/react"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import type { RaccoonMarketplaceScope, RaccoonMcpServerConfig } from "../../protocol"
import { Button } from "../ui"
import { SelectField, Textarea, TextField, TextInput } from "./settings-common"

type Mode = "json" | "remote"

type HeaderRow = { name: string; value: string }

type ParsedServer = { id: string; config: RaccoonMcpServerConfig }

export function SettingsMcpManual() {
  const language = useLanguage()
  const vscode = useVSCode()
  const [mode, setMode] = useState<Mode>("json")
  const [scope, setScope] = useState<RaccoonMarketplaceScope>("project")
  const [json, setJson] = useState("")
  const [remoteName, setRemoteName] = useState("")
  const [remoteUrl, setRemoteUrl] = useState("")
  const [headers, setHeaders] = useState<HeaderRow[]>([{ name: "", value: "" }])
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    return vscode.onMessage((message) => {
      if (message.type !== "mcpManualAddResult") return
      setPending(false)
      if (message.success) {
        setSuccess(true)
        setError(undefined)
        setJson("")
        setRemoteName("")
        setRemoteUrl("")
        setHeaders([{ name: "", value: "" }])
      } else {
        setError(message.error ?? language.t("settings.mcpManual.parseError"))
      }
    })
  }, [vscode, language])

  const jsonServers = useMemo(() => (mode === "json" ? parseJsonConfig(json) : undefined), [mode, json])

  const remoteServer = useMemo<ParsedServer | undefined>(() => {
    if (mode !== "remote") return undefined
    const id = remoteName.trim()
    const url = remoteUrl.trim()
    if (!id || !url) return undefined
    const headerEntries = headers
      .map((row) => [row.name.trim(), row.value.trim()] as const)
      .filter(([name, value]) => name && value)
    return {
      id,
      config: {
        type: "remote",
        url,
        ...(headerEntries.length > 0 ? { headers: Object.fromEntries(headerEntries) } : {}),
      },
    }
  }, [mode, remoteName, remoteUrl, headers])

  const servers = mode === "json" ? jsonServers : remoteServer ? [remoteServer] : undefined
  const canAdd = !pending && !!servers && servers.length > 0

  const preview = useMemo(() => {
    if (!servers || servers.length === 0) return undefined
    return { mcp: Object.fromEntries(servers.map((server) => [server.id, server.config])) }
  }, [servers])

  const submit = () => {
    if (!servers || servers.length === 0) {
      setError(language.t("settings.mcpManual.parseError"))
      return
    }
    setError(undefined)
    setSuccess(false)
    setPending(true)
    for (const server of servers) {
      vscode.postMessage({ type: "addMcpServerManual", id: server.id, config: server.config, scope })
    }
  }

  const updateHeader = (index: number, patch: Partial<HeaderRow>) => {
    setHeaders((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
  }

  return (
    <section className="settings-mcp">
      <div className="settings-section-header">
        <div>
          <h3>{language.t("settings.mcpManual.title")}</h3>
          <p>{language.t("settings.mcpManual.subtitle")}</p>
        </div>
      </div>

      <div className="settings-mcp-modes">
        <button
          type="button"
          className={`settings-mcp-mode ${mode === "json" ? "active" : ""}`.trim()}
          onClick={() => setMode("json")}
        >
          {language.t("settings.mcpManual.mode.json")}
        </button>
        <button
          type="button"
          className={`settings-mcp-mode ${mode === "remote" ? "active" : ""}`.trim()}
          onClick={() => setMode("remote")}
        >
          {language.t("settings.mcpManual.mode.remote")}
        </button>
      </div>

      <SelectField
        label={language.t("settings.mcpMarketplace.scope")}
        value={scope}
        onChange={(value) => setScope(value as RaccoonMarketplaceScope)}
        options={[
          { value: "project", label: language.t("settings.mcpMarketplace.scope.project") },
          { value: "user", label: language.t("settings.mcpMarketplace.scope.user") },
        ]}
      />

      {mode === "json" ? (
        <label className="settings-dialog-field">
          <span>{language.t("settings.mcpManual.json.label")}</span>
          <Textarea
            value={json}
            onChange={(value) => {
              setJson(value)
              setSuccess(false)
              setError(undefined)
            }}
            rows={12}
            placeholder={language.t("settings.mcpManual.json.placeholder")}
            className="settings-mcp-json"
          />
          <small>{language.t("settings.mcpManual.json.help")}</small>
        </label>
      ) : (
        <>
          <TextField
            label={language.t("settings.mcpManual.name")}
            value={remoteName}
            placeholder={language.t("settings.mcpManual.name.placeholder")}
            onChange={(value) => {
              setRemoteName(value)
              setSuccess(false)
            }}
          />
          <TextField
            label={language.t("settings.mcpManual.url")}
            value={remoteUrl}
            placeholder={language.t("settings.mcpManual.url.placeholder")}
            onChange={(value) => {
              setRemoteUrl(value)
              setSuccess(false)
            }}
          />
          <div className="settings-mcp-headers">
            <div className="settings-dialog-section-title">{language.t("settings.mcpManual.headers")}</div>
            {headers.map((row, index) => (
              <div className="settings-mcp-header-row" key={index}>
                <TextInput
                  value={row.name}
                  placeholder={language.t("settings.mcpManual.headerName.placeholder")}
                  onChange={(value) => updateHeader(index, { name: value })}
                />
                <TextInput
                  value={row.value}
                  placeholder={language.t("settings.mcpManual.headerValue.placeholder")}
                  onChange={(value) => updateHeader(index, { value })}
                />
                <Button
                  variant="icon"
                  className="settings-dialog-icon-button"
                  disabled={headers.length <= 1}
                  onClick={() => setHeaders((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                  aria-label={language.t("settings.mcpManual.removeHeader")}
                >
                  <X size={12} weight="bold" />
                </Button>
              </div>
            ))}
            <Button
              variant="small"
              icon={<Plus size={12} weight="bold" />}
              onClick={() => setHeaders((current) => [...current, { name: "", value: "" }])}
            >
              {language.t("settings.mcpManual.addHeader")}
            </Button>
          </div>
        </>
      )}

      {preview ? (
        <div className="settings-mcp-preview">
          <div className="settings-dialog-section-title">{language.t("settings.mcpMarketplace.configPreview")}</div>
          <pre>{JSON.stringify(preview, null, 2)}</pre>
        </div>
      ) : null}

      {error ? <div className="settings-dialog-error">{error}</div> : null}
      {success ? (
        <div className="settings-mcp-success">
          <CheckCircle size={14} weight="bold" /> {language.t("settings.mcpManual.success")}
        </div>
      ) : null}

      <div className="settings-mcp-actions">
        <Button disabled={!canAdd} onClick={submit}>
          {pending ? language.t("settings.mcpManual.adding") : language.t("settings.mcpManual.add")}
        </Button>
      </div>
    </section>
  )
}

/**
 * Parse a pasted MCP configuration into a list of named server configs.
 * Accepts three shapes:
 *  - opencode native:   { "mcp": { name: { type, command/url, ... } } }
 *  - Claude/Cursor:     { "mcpServers": { name: { command, args, env } } }
 *  - a single server:   { type, command/url, ... }  (named "mcp-server")
 * Returns undefined when nothing parseable is found.
 */
function parseJsonConfig(raw: string): ParsedServer[] | undefined {
  const text = raw.trim()
  if (!text) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined
  const root = parsed as Record<string, unknown>
  const container =
    isRecord(root.mcp) ? (root.mcp as Record<string, unknown>) : isRecord(root.mcpServers) ? (root.mcpServers as Record<string, unknown>) : undefined

  if (container) {
    const servers = Object.entries(container)
      .map(([name, value]) => toServer(name, value))
      .filter((server): server is ParsedServer => server !== undefined)
    return servers.length > 0 ? servers : undefined
  }

  const single = toServer("mcp-server", root)
  return single ? [single] : undefined
}

function toServer(name: string, value: unknown): ParsedServer | undefined {
  if (!isRecord(value)) return undefined
  const config = toConfig(value)
  if (!config) return undefined
  return { id: name, config }
}

function toConfig(value: Record<string, unknown>): RaccoonMcpServerConfig | undefined {
  // Remote: explicit type "remote"/"sse"/"http", or presence of a url.
  const type = typeof value.type === "string" ? value.type.toLowerCase() : undefined
  const url = typeof value.url === "string" ? value.url.trim() : undefined
  if (type === "remote" || type === "sse" || type === "http" || (url && !value.command)) {
    if (!url) return undefined
    const headers = toStringRecord(value.headers)
    return {
      type: "remote",
      url,
      ...(headers ? { headers } : {}),
    }
  }

  // Local: command may be a string (+ args[]) or already an array.
  const command = toCommand(value.command, value.args)
  if (command.length === 0) return undefined
  const environment = toStringRecord(value.environment) ?? toStringRecord(value.env)
  const cwd = typeof value.cwd === "string" && value.cwd.trim() ? value.cwd.trim() : undefined
  return {
    type: "local",
    command,
    ...(cwd ? { cwd } : {}),
    ...(environment ? { environment } : {}),
  }
}

function toCommand(command: unknown, args: unknown): string[] {
  const parts: string[] = []
  if (typeof command === "string") parts.push(command)
  else if (Array.isArray(command)) parts.push(...command.filter((part): part is string => typeof part === "string"))
  if (Array.isArray(args)) parts.push(...args.filter((part): part is string => typeof part === "string"))
  return parts.filter((part) => part.trim().length > 0)
}

function toStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value)
    .map(([key, val]) => [key, typeof val === "string" ? val : String(val)] as const)
    .filter(([key]) => key.trim().length > 0)
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
