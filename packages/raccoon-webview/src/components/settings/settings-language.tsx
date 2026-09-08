import { useLanguage } from "../../context/language"
import type { RaccoonPluginLanguageMode } from "../../protocol"
import { Select, SettingsRow } from "./settings-common"

export function SettingsLanguage(props: {
  pluginLanguageMode?: RaccoonPluginLanguageMode
  onPluginLanguageChange: (language: RaccoonPluginLanguageMode) => void
}) {
  const language = useLanguage()
  const value = props.pluginLanguageMode ?? "auto"
  const title = language.t("settings.language.plugin.title")
  const options = [
    { value: "auto", label: language.t("settings.language.plugin.auto") },
    { value: "zh-Hans", label: "简体中文" },
    { value: "zh-Hant", label: "繁體中文" },
    { value: "en", label: "English" },
  ] satisfies Array<{ value: RaccoonPluginLanguageMode; label: string }>

  return (
    <>
      <h3>{language.t("settings.language.title")}</h3>
      <div className="settings-card settings-model-card">
        <SettingsRow title={title} description={language.t("settings.language.plugin.description")}>
          <Select
            className="settings-select w-[160px] max-w-full"
            value={value}
            options={options}
            ariaLabel={title}
            onChange={(next) => props.onPluginLanguageChange(next as RaccoonPluginLanguageMode)}
          />
        </SettingsRow>
      </div>
    </>
  )
}
