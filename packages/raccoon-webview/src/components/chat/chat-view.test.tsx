import { afterEach, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LanguageProvider } from "../../context/language"
import { SessionProvider } from "../../context/session"
import { VSCodeProvider } from "../../context/vscode"
import type { RaccoonState } from "../../protocol"
import { ChatView } from "./chat-view"

afterEach(() => {
  Reflect.deleteProperty(globalThis, "acquireVsCodeApi")
})

test("groups context details and compact controls without a duplicate percentage label", () => {
  const state = {
    activeSessionID: "ses_1",
    sessions: [{ id: "ses_1", title: "Context controls", updatedAt: 1 }],
    messages: [
      {
        id: "msg_1",
        role: "assistant",
        text: "Ready",
        parts: [{ id: "prt_1", type: "text", text: "Ready" }],
        createdAt: 1,
        tokens: { input: 300, output: 50, reasoning: 0, cache: { read: 0, write: 0 }, total: 350 },
      },
    ],
    agents: [],
    models: [
      {
        providerID: "raccoon",
        providerName: "Raccoon",
        modelID: "raccoon-pro",
        modelName: "Raccoon Pro",
        enabled: true,
        connected: true,
        contextLimit: 1_000,
      },
    ],
    providers: [],
    mcpMarketplace: { items: [], installed: { project: {}, user: {} } },
    skillMarketplace: { sources: [], items: [], installed: { project: {}, user: {} } },
    selectedModel: { providerID: "raccoon", modelID: "raccoon-pro" },
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

  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <ChatView />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).toContain('class="chat-header-context-actions"')
  expect(html).toContain('aria-label="用量明细"')
  expect(html).toContain('aria-label="精简会话"')
  expect(html).not.toContain('class="session-usage-total-inline')
})
