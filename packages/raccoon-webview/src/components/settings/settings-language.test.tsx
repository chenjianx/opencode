import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LanguageProvider } from "../../context/language"
import { VSCodeProvider } from "../../context/vscode"
import { SettingsLanguage } from "./settings-language"

test("renders the plugin language as an in-app listbox trigger instead of a native select", () => {
  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SettingsLanguage pluginLanguageMode="zh-Hant" onPluginLanguageChange={() => {}} />
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).not.toContain("<select")
  expect(html).toContain('aria-haspopup="listbox"')
  expect(html).toContain('aria-expanded="false"')
  expect(html).toContain('aria-label="插件语言: 繁體中文"')
  expect(html).toContain("繁體中文")
})
