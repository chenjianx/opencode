import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LanguageProvider } from "../../../context/language"
import { SessionProvider } from "../../../context/session"
import { VSCodeProvider } from "../../../context/vscode"
import type { RaccoonState } from "../../../protocol"
import { PromptInput } from "./prompt-input"
import { promptSendState } from "./prompt-input-utils"

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

test("keeps compact prompt actions in the footer flow", () => {
  const html = renderPrompt({ activeSessionID: "session-1" })

  expect(html).toContain('data-prompt-footer-layout="flow"')
  expect(html).toContain('data-prompt-actions="compact"')
  expect(html).toContain("h-[30px] w-[30px]")
  expect(html).not.toContain("absolute right-1.5 top-0")
})

test("shows a stop glyph instead of a loading spinner while generation is running", () => {
  const html = renderPrompt({ activeSessionID: "session-1", busy: true })

  expect(html).toContain('data-prompt-send-state="busy"')
  expect(html).toContain('data-prompt-action-icon="stop"')
  expect(html).not.toContain('data-prompt-action-icon="loading"')
})

test("classifies the send button into disabled, ready, and busy visual states", () => {
  expect(promptSendState({ busy: false, canSend: false, submitting: false })).toBe("disabled")
  expect(promptSendState({ busy: false, canSend: true, submitting: false })).toBe("ready")
  expect(promptSendState({ busy: true, canSend: true, submitting: false })).toBe("busy")
  expect(promptSendState({ busy: false, canSend: true, submitting: true })).toBe("busy")
})

test("does not compound opacity on the disabled send icon", () => {
  const html = renderPrompt()

  expect(html).toContain('data-prompt-send-state="disabled"')
  expect(html).not.toContain('data-prompt-action-icon="send" class="opacity-55"')
})

test("shows the guarded permission icon when automatic approval is off", () => {
  const html = renderPrompt({ activeSessionID: "session-1" })

  expect(html).toContain('data-prompt-auto-approve-state="off"')
  expect(html).toContain('data-prompt-permission-icon="guarded"')
  expect(html).not.toContain('data-prompt-permission-icon="bypass"')
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
