import { useEffect, useMemo, useState } from "react"
import { ArrowClockwise, CheckCircle, Circle, PencilSimple, Plug, Plugs, Plus, Trash, Warning, X } from "@phosphor-icons/react"
import { useLanguage } from "../../context/language"
import { useSession } from "../../context/session"
import { useVSCode } from "../../context/vscode"
import type { RaccoonInstalledMcp, RaccoonMcpServerConfig, RaccoonMcpStatus } from "../../protocol"
import { Button } from "../ui"
import { SettingsDialog } from "./settings-dialog"
import { TextField, TextInput } from "./settings-common"

export function SettingsMcpInstalled() {
  const language = useLanguage()
  const session = useSession()
  const vscode = useVSCode()
  const installed = session.state.mcpInstalled
  const servers = installed?.servers ?? []
  const [expanded, setExpanded] = useState<string>()
  const [pendingID, setPendingID] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  const [editing, setEditing] = useState<RaccoonInstalledMcp>()

  useEffect(() => {
    if (!session.state.mcpInstalled) {
      vscode.postMessage({ type: "fetchMcpInstalled" })
    }
  }, [session.state.mcpInstalled, vscode])

  useEffect(() => {
    return vscode.onMessage((message) => {
      if (message.type === "mcpServerActionResult") {
        setPendingID(undefined)
        setActionError(message.success ? undefined : message.error)
        if (message.success) setEditing(undefined)
      }
    })
  }, [vscode])

  const refresh = () => {
    setActionError(undefined)
    vscode.postMessage({ type: "fetchMcpInstalled" })
  }

  const setEnabled = (server: RaccoonInstalledMcp, enabled: boolean) => {
    setPendingID(server.id)
    setActionError(undefined)
    vscode.postMessage({ type: "setMcpServerEnabled", id: server.id, scope: server.scope, enabled })
  }

  const connect = (server: RaccoonInstalledMcp) => {
    setPendingID(server.id)
    setActionError(undefined)
    vscode.postMessage({ type: "connectMcpServer", id: server.id })
  }

  const disconnect = (server: RaccoonInstalledMcp) => {
    setPendingID(server.id)
    setActionError(undefined)
    vscode.postMessage({ type: "disconnectMcpServer", id: server.id })
  }

  const remove = (server: RaccoonInstalledMcp) => {
    setPendingID(server.id)
    setActionError(undefined)
    vscode.postMessage({ type: "removeMcpServer", id: server.id, scope: server.scope })
  }

  const saveEdit = (server: RaccoonInstalledMcp, config: RaccoonMcpServerConfig) => {
    setPendingID(server.id)
    setActionError(undefined)
    vscode.postMessage({ type: "updateMcpServer", id: server.id, scope: server.scope, config })
  }

  return (
    <section className="settings-mcp">
      <div className="settings-section-header">
        <div>
          <h3>{language.t("settings.mcpInstalled.title")}</h3>
          <p>{language.t("settings.mcpInstalled.subtitle")}</p>
        </div>
        <Button onClick={refresh} disabled={installed?.loading} icon={<ArrowClockwise size={14} weight="bold" />}>
          {installed?.loading ? language.t("settings.mcpInstalled.loading") : language.t("settings.mcpInstalled.refresh")}
        </Button>
      </div>

      {installed?.error ? <div className="settings-dialog-error">{installed.error}</div> : null}
      {actionError ? <div className="settings-dialog-error">{actionError}</div> : null}

      {servers.length === 0 ? (
        <div className="settings-empty">{language.t("settings.mcpInstalled.empty")}</div>
      ) : (
        <div className="settings-browser-installed-list">
          {servers.map((server) => {
            const isExpanded = expanded === serverKey(server)
            const enabled = server.config.enabled !== false
            const pending = pendingID === server.id
            return (
              <div className="settings-browser-installed-item" key={serverKey(server)}>
                <div className="settings-browser-installed-row">
                  <button
                    type="button"
                    className="settings-browser-installed-main"
                    onClick={() => setExpanded(isExpanded ? undefined : serverKey(server))}
                  >
                    <StatusBadge status={server.status} enabled={enabled} />
                    <span className="settings-browser-installed-name">{server.id}</span>
                    <span className="settings-browser-installed-scope">
                      {language.t(`settings.mcpMarketplace.scope.${server.scope}`)}
                    </span>
                    <span className="settings-browser-installed-type">{server.config.type}</span>
                  </button>
                  <div className="settings-browser-installed-actions">
                    <input
                      type="checkbox"
                      role="switch"
                      className="settings-toggle"
                      checked={enabled}
                      disabled={pending}
                      aria-label={language.t("settings.mcpInstalled.enabled")}
                      title={enabled ? language.t("settings.mcpInstalled.enabled") : language.t("settings.mcpInstalled.disabled")}
                      onChange={(event) => setEnabled(server, event.currentTarget.checked)}
                    />
                  </div>
                </div>
                {isExpanded ? (
                  <div className="settings-browser-installed-detail">
                    <ServerDetail server={server} />
                    <div className="settings-browser-actions">
                      {server.status?.status === "connected" ? (
                        <Button disabled={pending} onClick={() => disconnect(server)} icon={<Plugs size={14} weight="bold" />}>
                          {language.t("settings.mcpInstalled.disconnect")}
                        </Button>
                      ) : (
                        <Button disabled={pending || !enabled} onClick={() => connect(server)} icon={<Plug size={14} weight="bold" />}>
                          {language.t("settings.mcpInstalled.connect")}
                        </Button>
                      )}
                      <Button disabled={pending} onClick={() => setEditing(server)} icon={<PencilSimple size={14} weight="bold" />}>
                        {language.t("settings.mcpInstalled.edit")}
                      </Button>
                      <Button disabled={pending} onClick={() => remove(server)} icon={<Trash size={14} weight="bold" />}>
                        {language.t("settings.mcpInstalled.remove")}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {editing ? (
        <EditDialog
          server={editing}
          saving={pendingID === editing.id}
          error={actionError}
          onSave={(config) => saveEdit(editing, config)}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </section>
  )
}

function StatusBadge(props: { status?: RaccoonMcpStatus; enabled: boolean }) {
  const language = useLanguage()
  const status = props.status?.status ?? (props.enabled ? undefined : "disabled")
  if (status === "connected") {
    return (
      <span className="settings-mcp-status connected" title={language.t("settings.mcpInstalled.status.connected")}>
        <CheckCircle size={13} weight="fill" />
      </span>
    )
  }
  if (status === "failed" || status === "needs_client_registration") {
    const error = props.status && "error" in props.status ? props.status.error : undefined
    return (
      <span className="settings-mcp-status failed" title={error ?? language.t("settings.mcpInstalled.status.failed")}>
        <Warning size={13} weight="fill" />
      </span>
    )
  }
  if (status === "needs_auth") {
    return (
      <span className="settings-mcp-status needs-auth" title={language.t("settings.mcpInstalled.status.needsAuth")}>
        <Warning size={13} weight="fill" />
      </span>
    )
  }
  return (
    <span className="settings-mcp-status disabled" title={language.t("settings.mcpInstalled.status.disabled")}>
      <Circle size={13} weight="fill" />
    </span>
  )
}

function ServerDetail(props: { server: RaccoonInstalledMcp }) {
  const language = useLanguage()
  const config = props.server.config
  const error = props.server.status && "error" in props.server.status ? props.server.status.error : undefined
  const envKeys = useMemo(
    () => (config.type === "local" ? Object.keys(config.environment ?? {}) : Object.keys(config.headers ?? {})),
    [config],
  )
  return (
    <div className="settings-browser-transport">
      {error ? <div className="settings-dialog-error">{error}</div> : null}
      <div>
        <div className="settings-browser-transport-title">
          {config.type === "local" ? language.t("settings.mcpInstalled.command") : language.t("settings.mcpInstalled.url")}
        </div>
        <code>{config.type === "local" ? config.command.join(" ") : config.url}</code>
      </div>
      {envKeys.length > 0 ? (
        <div>
          <div className="settings-browser-transport-title">
            {config.type === "local"
              ? language.t("settings.mcpMarketplace.environment")
              : language.t("settings.mcpMarketplace.headers")}
          </div>
          {envKeys.map((key) => (
            <div className="settings-mcp-env-row" key={key}>
              <code>{key}</code>
              <span className="settings-mcp-env-tags">
                <span>••••</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

type KeyValueRow = { name: string; value: string }

function recordToRows(record?: Record<string, string>): KeyValueRow[] {
  const rows = Object.entries(record ?? {}).map(([name, value]) => ({ name, value }))
  return rows.length > 0 ? rows : [{ name: "", value: "" }]
}

function rowsToRecord(rows: KeyValueRow[]): Record<string, string> {
  const entries = rows
    .map((row) => [row.name.trim(), row.value.trim()] as const)
    .filter(([name, value]) => name && value)
  return Object.fromEntries(entries)
}

function EditDialog(props: {
  server: RaccoonInstalledMcp
  saving: boolean
  error?: string
  onSave: (config: RaccoonMcpServerConfig) => void
  onClose: () => void
}) {
  const language = useLanguage()
  const config = props.server.config
  const isLocal = config.type === "local"
  const [command, setCommand] = useState(isLocal ? config.command.join(" ") : "")
  const [cwd, setCwd] = useState(isLocal ? (config.cwd ?? "") : "")
  const [url, setUrl] = useState(isLocal ? "" : config.url)
  const [pairs, setPairs] = useState<KeyValueRow[]>(
    recordToRows(isLocal ? config.environment : config.headers),
  )
  const [timeoutText, setTimeoutText] = useState(config.timeout !== undefined ? String(config.timeout) : "")

  const updatePair = (index: number, patch: Partial<KeyValueRow>) => {
    setPairs((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
  }

  const built = useMemo<RaccoonMcpServerConfig | undefined>(() => {
    const record = rowsToRecord(pairs)
    const timeoutValue = timeoutText.trim() ? Number(timeoutText.trim()) : undefined
    const timeoutPart =
      timeoutValue !== undefined && Number.isFinite(timeoutValue) ? { timeout: timeoutValue } : {}
    // Preserve the current enabled state — sanitizeManualConfig drops enabled:true.
    const enabledPart = config.enabled === false ? { enabled: false as const } : {}
    if (isLocal) {
      const parts = command.trim().split(/\s+/).filter(Boolean)
      if (parts.length === 0) return undefined
      return {
        type: "local",
        command: parts,
        ...(cwd.trim() ? { cwd: cwd.trim() } : {}),
        ...(Object.keys(record).length > 0 ? { environment: record } : {}),
        ...enabledPart,
        ...timeoutPart,
      }
    }
    if (!url.trim()) return undefined
    return {
      type: "remote",
      url: url.trim(),
      ...(Object.keys(record).length > 0 ? { headers: record } : {}),
      ...enabledPart,
      ...timeoutPart,
    }
  }, [isLocal, command, cwd, url, pairs, timeoutText, config.enabled])

  const preview = built ? { mcp: { [props.server.id]: built } } : undefined

  return (
    <SettingsDialog
      titleId="settings-mcp-edit-title"
      title={language.t("settings.mcpInstalled.editTitle", { name: props.server.id })}
      subtitle={language.t(`settings.mcpMarketplace.scope.${props.server.scope}`)}
      onClose={props.onClose}
      className="settings-browser-install-dialog"
      footer={
        <>
          <Button onClick={props.onClose}>{language.t("common.cancel")}</Button>
          <Button disabled={!built || props.saving} onClick={() => built && props.onSave(built)}>
            {props.saving ? language.t("settings.mcpInstalled.saving") : language.t("settings.mcpInstalled.save")}
          </Button>
        </>
      }
    >
      {isLocal ? (
        <>
          <TextField
            label={language.t("settings.mcpInstalled.command")}
            value={command}
            placeholder="npx -y @modelcontextprotocol/server-filesystem /path"
            onChange={setCommand}
          />
          <TextField
            label={language.t("settings.mcpInstalled.cwd")}
            value={cwd}
            onChange={setCwd}
          />
        </>
      ) : (
        <TextField label={language.t("settings.mcpInstalled.url")} value={url} onChange={setUrl} />
      )}

      <div className="settings-mcp-headers">
        <div className="settings-dialog-section-title">
          {isLocal
            ? language.t("settings.mcpMarketplace.environment")
            : language.t("settings.mcpMarketplace.headers")}
        </div>
        {pairs.map((row, index) => (
          <div className="settings-mcp-header-row" key={index}>
            <TextInput
              value={row.name}
              placeholder={isLocal ? "ENV_NAME" : "Authorization"}
              onChange={(value) => updatePair(index, { name: value })}
            />
            <TextInput
              value={row.value}
              placeholder={isLocal ? "value" : "Bearer ..."}
              onChange={(value) => updatePair(index, { value })}
            />
            <Button
              variant="icon"
              className="settings-dialog-icon-button"
              disabled={pairs.length <= 1}
              onClick={() => setPairs((current) => current.filter((_, rowIndex) => rowIndex !== index))}
              aria-label={language.t("settings.mcpInstalled.removeEnv")}
            >
              <X size={12} weight="bold" />
            </Button>
          </div>
        ))}
        <Button
          variant="small"
          icon={<Plus size={12} weight="bold" />}
          onClick={() => setPairs((current) => [...current, { name: "", value: "" }])}
        >
          {language.t("settings.mcpInstalled.addEnv")}
        </Button>
      </div>

      <TextField
        label={language.t("settings.mcpInstalled.timeout")}
        value={timeoutText}
        placeholder="0"
        onChange={setTimeoutText}
      />

      {preview ? (
        <div className="settings-browser-preview">
          <div className="settings-dialog-section-title">{language.t("settings.mcpMarketplace.configPreview")}</div>
          <pre>{JSON.stringify(preview, null, 2)}</pre>
        </div>
      ) : null}

      {props.error ? <div className="settings-dialog-error">{props.error}</div> : null}
    </SettingsDialog>
  )
}

function serverKey(server: RaccoonInstalledMcp) {
  return `${server.scope}:${server.id}`
}
