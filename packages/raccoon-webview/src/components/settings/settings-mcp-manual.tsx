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

type ParsedJsonConfig =
  | { status: "empty" }
  | { status: "invalid-json" }
  | { status: "invalid-config" }
  | { status: "valid"; servers: ParsedServer[] }

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

  const jsonResult = useMemo(() => (mode === "json" ? parseMcpJsonConfig(json) : undefined), [mode, json])

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

  const servers =
    mode === "json"
      ? jsonResult?.status === "valid"
        ? jsonResult.servers
        : undefined
      : remoteServer
        ? [remoteServer]
        : undefined
  const jsonInvalid = jsonResult?.status === "invalid-json" || jsonResult?.status === "invalid-config"
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
            ariaInvalid={jsonInvalid}
            ariaDescribedBy={
              jsonInvalid
                ? "settings-mcp-json-help settings-mcp-json-error"
                : "settings-mcp-json-help"
            }
          />
          <small id="settings-mcp-json-help">{language.t("settings.mcpManual.json.help")}</small>
          {jsonResult?.status === "invalid-json" ? (
            <span id="settings-mcp-json-error" className="settings-mcp-field-error" role="alert">
              {language.t("settings.mcpManual.invalidJson")}
            </span>
          ) : jsonResult?.status === "invalid-config" ? (
            <span id="settings-mcp-json-error" className="settings-mcp-field-error" role="alert">
              {language.t("settings.mcpManual.invalidConfig")}
            </span>
          ) : null}
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
        <div className="settings-browser-preview">
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

      <div className="settings-browser-actions">
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
 * Distinguishes empty input, invalid JSON, invalid MCP config, and recognized servers.
 */
export function parseMcpJsonConfig(raw: string): ParsedJsonConfig {
  const text = raw.trim()
  if (!text) return { status: "empty" }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { status: "invalid-json" }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { status: "invalid-config" }
  const root = parsed as Record<string, unknown>
  const container =
    isRecord(root.mcp) ? (root.mcp as Record<string, unknown>) : isRecord(root.mcpServers) ? (root.mcpServers as Record<string, unknown>) : undefined

  if (container) {
    const servers = Object.entries(container)
      .map(([name, value]) => toServer(name, value))
    if (servers.length === 0 || servers.some((server) => server === undefined)) return { status: "invalid-config" }
    return {
      status: "valid",
      servers: servers.filter((server): server is ParsedServer => server !== undefined),
    }
  }

  const single = toServer("mcp-server", root)
  return single ? { status: "valid", servers: [single] } : { status: "invalid-config" }
}

function toServer(name: string, value: unknown): ParsedServer | undefined {
  if (!name.trim()) return undefined
  if (!isRecord(value)) return undefined
  const config = toConfig(value)
  if (!config) return undefined
  return { id: name, config }
}

function toConfig(value: Record<string, unknown>): RaccoonMcpServerConfig | undefined {
  // Remote: explicit type "remote"/"sse"/"http", or presence of a url.
  if (value.type !== undefined && (typeof value.type !== "string" || !value.type.trim())) return undefined
  if (value.command !== undefined && typeof value.command !== "string" && !isStringArray(value.command)) return undefined
  if (value.args !== undefined && !isStringArray(value.args)) return undefined
  if (value.url !== undefined && typeof value.url !== "string") return undefined
  if (value.cwd !== undefined && typeof value.cwd !== "string") return undefined
  if (value.environment !== undefined && !isStringRecord(value.environment)) return undefined
  if (value.env !== undefined && !isStringRecord(value.env)) return undefined
  if (value.headers !== undefined && !isStringRecord(value.headers)) return undefined

  const type = typeof value.type === "string" ? value.type.trim().toLowerCase() : undefined
  if (type && type !== "local" && type !== "remote" && type !== "sse" && type !== "http") return undefined
  const url = typeof value.url === "string" ? value.url.trim() : undefined
  if (type === "remote" || type === "sse" || type === "http" || (!type && url && !value.command)) {
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
  const executable = typeof command === "string" ? [command] : isStringArray(command) ? command : []
  if (!executable.some((part) => part.trim())) return []
  const parts = [...executable]
  if (Array.isArray(args)) parts.push(...args.filter((part): part is string => typeof part === "string"))
  return parts.filter((part) => part.trim().length > 0)
}

function toStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isStringRecord(value)) return undefined
  const entries = Object.entries(value).filter(([key]) => key.trim().length > 0)
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false
  return Object.entries(value).every(([key, entry]) => !!key.trim() && typeof entry === "string")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
