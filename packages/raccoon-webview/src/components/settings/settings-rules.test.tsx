import { afterEach, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LanguageProvider } from "../../context/language"
import { SessionProvider } from "../../context/session"
import { VSCodeProvider } from "../../context/vscode"
import type { RaccoonRule, RaccoonState } from "../../protocol"
import { SettingsRules } from "./settings-rules"

afterEach(() => {
  Reflect.deleteProperty(globalThis, "acquireVsCodeApi")
})

function renderRules(rules: RaccoonRule[]) {
  const state = {
    view: "settings",
    raccoonLoggedIn: true,
    sessions: [],
    messages: [],
    agents: [],
    models: [],
    providers: [],
    customProviders: [],
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
          <SettingsRules rules={rules} onSaveRule={() => {}} onToggleRule={() => {}} onDeleteRule={() => {}} />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )
}

test("rule navigation groups project and user rules for scanning", () => {
  const html = renderRules([
    { name: "user-rule", scope: "user", enabled: true, content: "User" },
    { name: "project-rule", scope: "project", enabled: true, content: "Project" },
  ])

  expect(html).toContain('class="settings-rules-group" aria-label="项目"')
  expect(html).toContain('class="settings-rules-group" aria-label="用户"')
  expect(html.indexOf("项目")).toBeLessThan(html.indexOf("project-rule"))
  expect(html.indexOf("用户")).toBeLessThan(html.indexOf("user-rule"))
})

test("rule navigation owns its layout without command-specific classes", () => {
  const html = renderRules([{ name: "project-rule", scope: "project", enabled: true, content: "Project" }])

  expect(html).not.toContain("settings-commands-")
  expect(html).toContain('class="settings-rules-pane"')
  expect(html).toContain('class="settings-rules-node"')
})

test("keeps the create action in the page intro", () => {
  const html = renderRules([{ name: "project-rule", scope: "project", enabled: true, content: "Project" }])
  const introIndex = html.indexOf('class="settings-rules-intro"')
  const shellIndex = html.indexOf('class="settings-rules-shell"')

  expect(html.slice(introIndex, shellIndex)).toContain(">新建规则<")
  expect(html).not.toContain("settings-rules-pane-toolbar")
})

test("declares editor actions in a footer after the editor body", async () => {
  const source = await Bun.file(new URL("./settings-rules.tsx", import.meta.url)).text()
  const bodyIndex = source.indexOf('<div className="settings-rules-editor-body">')
  const footerIndex = source.indexOf('<div className="settings-rules-editor-footer">')

  expect(footerIndex).toBeGreaterThan(bodyIndex)
  expect(source.indexOf('{language.t("common.cancel")}', footerIndex)).toBeGreaterThan(footerIndex)
  expect(source.indexOf('className="settings-rules-save"', footerIndex)).toBeGreaterThan(footerIndex)
})

test("lets footer errors wrap above the editor actions", async () => {
  const styles = await Bun.file(new URL("../../styles/settings.css", import.meta.url)).text()
  const errorStyleIndex = styles.indexOf(".settings-rules-editor-footer .settings-rules-error")
  const errorStyleEndIndex = styles.indexOf("}", errorStyleIndex)

  expect(styles.slice(errorStyleIndex, errorStyleEndIndex)).toContain("w-full")
  expect(styles.slice(errorStyleIndex, errorStyleEndIndex)).toContain("break-words")
})
