import { useState, type KeyboardEvent } from "react"
import { useLanguage } from "../../context/language"
import { SettingsMcpInstalled } from "./settings-mcp-installed"
import { SettingsMcpManual } from "./settings-mcp-manual"
import { SettingsMcpMarketplace } from "./settings-mcp-marketplace"

type McpTab = "marketplace" | "installed" | "manual"

const MCP_TABS = [
  { id: "marketplace", label: "settings.mcp.tab.marketplace" },
  { id: "installed", label: "settings.mcp.tab.installed" },
  { id: "manual", label: "settings.mcp.tab.manual" },
] as const

export function SettingsMcp() {
  const language = useLanguage()
  const [tab, setTab] = useState<McpTab>("marketplace")

  const activateFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, current: McpTab) => {
    const next = nextMcpTab(current, event.key)
    if (!next) return
    event.preventDefault()
    setTab(next)
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`#settings-mcp-tab-${next}`)
      ?.focus()
  }

  return (
    <div className="settings-browser-shell">
      <div className="settings-browser-tabs" role="tablist" aria-label={language.t("settings.nav.mcp")}>
        {MCP_TABS.map((entry) => (
          <button
            id={`settings-mcp-tab-${entry.id}`}
            type="button"
            className={`settings-browser-tab ${tab === entry.id ? "active" : ""}`.trim()}
            role="tab"
            aria-selected={tab === entry.id}
            aria-controls={`settings-mcp-panel-${entry.id}`}
            tabIndex={tab === entry.id ? 0 : -1}
            onClick={() => setTab(entry.id)}
            onKeyDown={(event) => activateFromKeyboard(event, entry.id)}
            key={entry.id}
          >
            {language.t(entry.label)}
          </button>
        ))}
      </div>
      {MCP_TABS.map((entry) => (
        <div
          id={`settings-mcp-panel-${entry.id}`}
          role="tabpanel"
          aria-labelledby={`settings-mcp-tab-${entry.id}`}
          className="settings-browser-panel"
          hidden={tab !== entry.id}
          key={entry.id}
        >
          {tab === entry.id ? (
            entry.id === "marketplace" ? (
              <SettingsMcpMarketplace />
            ) : entry.id === "installed" ? (
              <SettingsMcpInstalled />
            ) : (
              <SettingsMcpManual />
            )
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function nextMcpTab(tab: McpTab, key: string): McpTab | undefined {
  if (key === "Home") return "marketplace"
  if (key === "End") return "manual"
  if (key === "ArrowLeft") {
    if (tab === "marketplace") return "manual"
    if (tab === "installed") return "marketplace"
    return "installed"
  }
  if (key === "ArrowRight") {
    if (tab === "marketplace") return "installed"
    if (tab === "installed") return "manual"
    return "marketplace"
  }
  return undefined
}
