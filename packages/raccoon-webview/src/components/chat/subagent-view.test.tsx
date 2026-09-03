import { afterEach, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LanguageProvider } from "../../context/language"
import { SessionProvider } from "../../context/session"
import { VSCodeProvider } from "../../context/vscode"
import { SubAgentView } from "./subagent-view"

afterEach(() => {
  Reflect.deleteProperty(globalThis, "acquireVsCodeApi")
})

test("shows the parent subagent in the header when viewing a nested subagent", () => {
  Object.defineProperty(globalThis, "acquireVsCodeApi", {
    configurable: true,
    value: () => ({
      postMessage: () => {},
      getState: () => ({
        view: "subagent",
        subAgentTrail: [{ sessionID: "ses_explore", title: "explore · Analyze project" }],
        subAgentView: {
          sessionID: "ses_research",
          title: "research · Inspect packages",
          messages: [],
        },
      }),
      setState: () => {},
    }),
  })

  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <SubAgentView />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).toContain("explore · Analyze project")
  expect(html).toContain("research · Inspect packages")
  expect(html).toContain('aria-label="子智能体"')
})

test("keeps only the immediate parent in a deeply nested narrow header", () => {
  Object.defineProperty(globalThis, "acquireVsCodeApi", {
    configurable: true,
    value: () => ({
      postMessage: () => {},
      getState: () => ({
        view: "subagent",
        subAgentTrail: [
          { sessionID: "ses_root_child", title: "planner · Root planning" },
          { sessionID: "ses_explore", title: "explore · Analyze project" },
        ],
        subAgentView: {
          sessionID: "ses_research",
          title: "research · Inspect packages",
          messages: [],
        },
      }),
      setState: () => {},
    }),
  })

  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <SubAgentView />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).not.toContain("planner · Root planning")
  expect(html).toContain("explore · Analyze project")
  expect(html).toContain("research · Inspect packages")
})
