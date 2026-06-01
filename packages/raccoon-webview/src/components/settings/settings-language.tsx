import { useLanguage } from "../../context/language"
import type { RaccoonPluginLanguageMode } from "../../protocol"
import { SettingsRow } from "./settings-common"

export function SettingsLanguage(props: {
  pluginLanguageMode?: RaccoonPluginLanguageMode
  onPluginLanguageChange: (language: RaccoonPluginLanguageMode) => void
}) {
  const language = useLanguage()

  return (
    <>
      <h3>{language.t("settings.language.title")}</h3>
      <div className="settings-card settings-model-card">
        <SettingsRow title={language.t("settings.language.plugin.title")} description={language.t("settings.language.plugin.description")}>
          <select
            className="settings-select"
            value={props.pluginLanguageMode ?? "auto"}
            aria-label={language.t("settings.language.plugin.title")}
            onChange={(event) => props.onPluginLanguageChange(event.currentTarget.value as RaccoonPluginLanguageMode)}
          >
            <option value="auto">Auto (VS Code language)</option>
            <option value="zh-Hans">简体中文</option>
            <option value="zh-Hant">繁體中文</option>
            <option value="en">English</option>
          </select>
        </SettingsRow>
      </div>
    </>
  )
}
