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

function UserTurn() {
  const session = useSession()
  return <MessageTurn turn={{ user, assistant: [] }} session={session} inlineQuestions={[]} />
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
