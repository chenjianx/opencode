import { useState } from "react"
import { useLanguage } from "../../context/language"
import { SettingsMcpInstalled } from "./settings-mcp-installed"
import { SettingsMcpManual } from "./settings-mcp-manual"
import { SettingsMcpMarketplace } from "./settings-mcp-marketplace"

type McpTab = "marketplace" | "installed" | "manual"

export function SettingsMcp() {
  const language = useLanguage()
  const [tab, setTab] = useState<McpTab>("marketplace")

  return (
    <div className="settings-mcp-shell">
      <div className="settings-mcp-tabs">
        <button
          type="button"
          className={`settings-mcp-tab ${tab === "marketplace" ? "active" : ""}`.trim()}
          onClick={() => setTab("marketplace")}
        >
          {language.t("settings.mcp.tab.marketplace")}
        </button>
        <button
          type="button"
          className={`settings-mcp-tab ${tab === "installed" ? "active" : ""}`.trim()}
          onClick={() => setTab("installed")}
        >
          {language.t("settings.mcp.tab.installed")}
        </button>
        <button
          type="button"
          className={`settings-mcp-tab ${tab === "manual" ? "active" : ""}`.trim()}
          onClick={() => setTab("manual")}
        >
          {language.t("settings.mcp.tab.manual")}
        </button>
      </div>
      {tab === "marketplace" ? (
        <SettingsMcpMarketplace />
      ) : tab === "installed" ? (
        <SettingsMcpInstalled />
      ) : (
        <SettingsMcpManual />
      )}
    </div>
  )
}
