import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LanguageProvider } from "../../../context/language"
import { VSCodeProvider } from "../../../context/vscode"
import { WelcomeEmpty } from "./welcome-empty"

test("renders the compact shortcut-only welcome state", () => {
  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <WelcomeEmpty />
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).toContain("商汤小浣熊")
  expect(html).toContain("能搞定工作的 AI 助手")
  expect(html).toContain('aria-label="快捷操作"')
  expect(html).toContain("⌘ L")
  expect(html).toContain("Ctrl L")
  expect(html).toContain("打开聊天；有选区时一并带入")
  expect(html.match(/<kbd/g)).toHaveLength(4)
  expect(html).not.toContain("<a ")
})
