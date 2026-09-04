import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LanguageProvider } from "../../../context/language"
import { SessionProvider } from "../../../context/session"
import { VSCodeProvider } from "../../../context/vscode"
import type { RaccoonState } from "../../../protocol"
import { PromptInput } from "./prompt-input"

function renderPrompt(state?: Partial<RaccoonState>) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "acquireVsCodeApi")
  Object.defineProperty(globalThis, "acquireVsCodeApi", {
    configurable: true,
    value: () => ({
      postMessage: () => {},
      getState: () => ({
        sessions: [],
        messages: [],
        agents: [],
        models: [],
        providers: [],
        mode: "build",
        loading: false,
        ...state,
      }),
      setState: () => {},
    }),
  })

  try {
    return renderToStaticMarkup(
      <VSCodeProvider>
        <LanguageProvider>
          <SessionProvider>
            <PromptInput />
          </SessionProvider>
        </LanguageProvider>
      </VSCodeProvider>,
    )
  } finally {
    if (original) Object.defineProperty(globalThis, "acquireVsCodeApi", original)
    else delete globalThis.acquireVsCodeApi
  }
}

test("renders a compact two-row prompt before it grows with content", () => {
  const html = renderPrompt()

  expect(html).toContain('rows="2"')
})

test("shows a stop glyph instead of a loading spinner while generation is running", () => {
  const html = renderPrompt({ activeSessionID: "session-1", busy: true })

  expect(html).toContain('data-prompt-action-icon="stop"')
  expect(html).not.toContain('data-prompt-action-icon="loading"')
})

test("shows only the model name in the composer trigger and keeps the full label as a tooltip", () => {
  const model = {
    providerID: "raccoon",
    providerName: "Raccoon",
    modelID: "raccoon-pro",
    modelName: "Raccoon Pro",
    enabled: true,
    connected: true,
  }
  const html = renderPrompt({ models: [model], selectedModel: model })

  expect(html).toContain('title="Raccoon / Raccoon Pro"')
  expect(html).toContain(">Raccoon Pro</span>")
  expect(html).not.toContain(">Raccoon /</span>")
})
