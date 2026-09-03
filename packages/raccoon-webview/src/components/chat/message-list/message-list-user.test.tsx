import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LanguageProvider } from "../../../context/language"
import { SessionProvider } from "../../../context/session"
import { VSCodeProvider } from "../../../context/vscode"
import type { RaccoonMessage } from "../../../protocol"
import { UserMessage } from "./message-list-user"

const message: RaccoonMessage = {
  id: "msg_user",
  role: "user",
  text: "分析下当前项目",
  parts: [{ id: "prt_user", type: "text", text: "分析下当前项目" }],
}

test("groups icon-only user message actions with localized tooltips", () => {
  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <UserMessage message={message} onRevert={() => {}} />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).toContain('role="toolbar"')
  expect(html).toContain('aria-label="消息操作"')
  expect(html).toContain('title="撤回并编辑"')
  expect(html).toContain('title="复制消息"')
  expect(html).not.toContain(">撤回并编辑</button>")
  expect(html).not.toContain(">复制消息</button>")
})
