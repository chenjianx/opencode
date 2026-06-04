import { useLanguage } from "../../context/language"
import type { RaccoonPluginLanguageMode } from "../../protocol"
import { SettingsRow, Select } from "./settings-common"

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
          <Select
            className="settings-select"
            value={props.pluginLanguageMode ?? "auto"}
            ariaLabel={language.t("settings.language.plugin.title")}
            onChange={(value) => props.onPluginLanguageChange(value as RaccoonPluginLanguageMode)}
            options={[
              { value: "auto", label: language.t("settings.language.plugin.auto") },
              { value: "zh-Hans", label: "简体中文" },
              { value: "zh-Hant", label: "繁體中文" },
              { value: "en", label: "English" },
            ]}
          />
        </SettingsRow>
      </div>
    </>
  )
}
