import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LanguageProvider } from "../../../context/language"
import { SessionProvider, useSession } from "../../../context/session"
import { VSCodeProvider } from "../../../context/vscode"
import type { RaccoonMessage } from "../../../protocol"
import { MessageTurn } from "./message-list-turn"

const user: RaccoonMessage = {
  id: "msg_user",
  role: "user",
  text: "Keep the original user message style",
  parts: [{ id: "prt_user", type: "text", text: "Keep the original user message style" }],
  createdAt: 1,
}

const assistant = {
  id: "msg_assistant",
  role: "assistant",
  text: "Finished summary",
  parts: [{ id: "prt_assistant", type: "text", text: "Finished summary" }],
  createdAt: 1_200,
  completedAt: 4_400,
  agent: "build",
  providerID: "raccoon",
  modelID: "raccoon-pro",
} as RaccoonMessage

function UserTurn() {
  const session = useSession()
  return <MessageTurn turn={{ user, assistant: [] }} session={session} inlineQuestions={[]} />
}

function AssistantTurn(props: { busy: boolean }) {
  const session = useSession()
  return (
    <MessageTurn
      turn={{ user: { ...user, createdAt: 1_000 }, assistant: [assistant] }}
      session={session}
      inlineQuestions={[]}
      busy={props.busy}
    />
  )
}

function renderAssistantTurn(busy: boolean) {
  return renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <AssistantTurn busy={busy} />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )
}

test("renders a user message without a role label or task panel", () => {
  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <UserTurn />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).toContain('class="user-message-content"')
  expect(html).not.toContain('class="turn-role"')
  expect(html).not.toContain(">你</div>")
  expect(html).not.toContain("本轮任务")
})

test("hides the assistant response footer while the turn is running", () => {
  expect(renderAssistantTurn(true)).not.toContain('class="assistant-summary-actions')
})

test("shows compact metadata and an icon-only copy action after the turn finishes", () => {
  const html = renderAssistantTurn(false)

  expect(html).toContain('class="assistant-summary-meta"')
  expect(html).toContain("Build · raccoon-pro · 3 秒")
  expect(html).toContain('aria-label="复制总结"')
  expect(html).not.toContain("<span>复制总结</span>")
  expect(html).not.toContain("is-entering")
})
