import { afterEach, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LanguageProvider } from "../../context/language"
import { SessionProvider } from "../../context/session"
import { VSCodeProvider } from "../../context/vscode"
import type { RaccoonState } from "../../protocol"
import { SettingsView } from "./settings-view"

afterEach(() => {
  Reflect.deleteProperty(globalThis, "acquireVsCodeApi")
})

function renderSettings(onClose?: () => void) {
  const state = {
    view: "settings",
    raccoonLoggedIn: true,
    sessions: [],
    messages: [],
    agents: [],
    models: [],
    providers: [
      {
        id: "comp",
        name: "comp",
        source: "custom",
        connected: true,
        modelCount: 1,
        enabledModelCount: 1,
      },
    ],
    customProviders: [
      {
        providerID: "comp",
        name: "comp",
        package: "@ai-sdk/openai-compatible",
        baseURL: "https://api.comp.example/v1",
        models: [{ id: "comp-model", name: "Comp Model" }],
      },
    ],
    mcpMarketplace: { items: [], installed: { project: {}, user: {} } },
    skillMarketplace: { sources: [], items: [], installed: { project: {}, user: {} } },
    mode: "build",
    loading: false,
  } satisfies RaccoonState

  Object.defineProperty(globalThis, "acquireVsCodeApi", {
    configurable: true,
    value: () => ({
      postMessage: () => {},
      getState: () => state,
      setState: () => {},
    }),
  })

  return renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <SettingsView onClose={onClose} />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )
}

test("standalone settings avoid a duplicate inner title and bound the working content", () => {
  const html = renderSettings()

  expect(html).not.toContain('class="settings-header"')
  expect(html).toContain('<div class="settings-content"><div class="settings-content-inner h-full">')
  expect(html).toContain("管理 Raccoon 账号及模型服务连接。")
})

test("inline settings retain an explicit back header", () => {
  const html = renderSettings(() => {})

  expect(html).toContain('class="settings-header"')
  expect(html).toContain('aria-label="返回"')
})

test("provider settings separate the account, connected list, and custom provider action", () => {
  const html = renderSettings()

  expect(html).toContain('aria-label="Raccoon 账号"')
  expect(html).toContain('aria-label="已连接提供商"')
  expect(html).toContain('aria-label="添加自定义提供商"')
  expect(html).toContain('class="ui-button ui-button--primary settings-provider-add-button"')
})
