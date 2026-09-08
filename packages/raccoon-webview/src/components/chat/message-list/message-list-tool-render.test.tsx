import { afterEach, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LanguageProvider } from "../../../context/language"
import { SessionProvider } from "../../../context/session"
import { VSCodeProvider } from "../../../context/vscode"
import { ToolPart } from "./message-list-tool"

afterEach(() => {
  Reflect.deleteProperty(globalThis, "acquireVsCodeApi")
})

test("hides a completed tool status while preserving its semantic state", () => {
  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <ToolPart part={{ id: "prt_read", type: "tool", tool: "read", status: "completed" }} />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).not.toContain(">完成</span>")
  expect(html).not.toContain(">completed</span>")
  expect(html).toContain('data-status="completed"')
})

test("hides a completed subagent status while preserving an icon navigation arrow", () => {
  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <ToolPart
            part={{
              id: "prt_task",
              type: "tool",
              tool: "task",
              status: "completed",
              metadata: { sessionId: "ses_child" },
            }}
          />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).not.toContain(">完成</span>")
  expect(html).not.toContain(">completed</span>")
  expect(html).toContain('<span class="tool-end"><span class="tool-arrow" aria-hidden="true"><svg')
  expect(html).not.toContain("›")
})

test("summarizes a completed subagent with its real tool-call count and duration", () => {
  Object.defineProperty(globalThis, "acquireVsCodeApi", {
    configurable: true,
    value: () => ({
      postMessage: () => {},
      getState: () => ({
        subSessions: {
          ses_child: {
            sessionID: "ses_child",
            status: "idle",
            tools: [],
            toolcalls: 6,
            startedAt: 1_000,
            completedAt: 19_000,
          },
        },
      }),
      setState: () => {},
    }),
  })

  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <ToolPart
            part={{
              id: "prt_task",
              type: "tool",
              tool: "task",
              status: "completed",
              input: { subagent_type: "explore", description: "Analyze project" },
              metadata: { sessionId: "ses_child" },
            }}
          />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).toContain("6 次工具调用 · 18s")
})

test("keeps task status and icon navigation arrow in one trailing alignment slot", () => {
  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <ToolPart
            part={{
              id: "prt_task",
              type: "tool",
              tool: "task",
              status: "running",
              input: { subagent_type: "explore", description: "Analyze project" },
              metadata: { sessionId: "ses_child" },
            }}
          />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).toContain('<span class="tool-end"><span data-slot="basic-tool-tool-arg">执行中</span><span class="tool-arrow" aria-hidden="true"><svg')
  expect(html).not.toContain("›")
})

test("reserves the icon arrow column when a completed tool has no details", () => {
  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <ToolPart part={{ id: "prt_read", type: "tool", tool: "read", status: "completed" }} />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).toContain('<span class="tool-end"><span class="tool-arrow placeholder" aria-hidden="true"></span></span>')
})

test("renders an icon expand arrow instead of a text glyph", () => {
  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <ToolPart
            part={{
              id: "prt_read",
              type: "tool",
              tool: "read",
              status: "completed",
              input: { filePath: "/workspace/application.yml" },
              output: "server:\n  port: 8080",
            }}
          />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).toContain('<span class="tool-arrow" aria-hidden="true"><svg')
  expect(html).not.toContain("⌄")
})

test("shows a complete path parameter without an extra action", () => {
  const filePath = `/Users/example/${"a-very-long-directory-name/".repeat(8)}src/main/application.yml`
  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <ToolPart
            part={{
              id: "prt_read",
              type: "tool",
              tool: "read",
              status: "completed",
              input: { filePath },
            }}
          />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).toContain(`class="tool-path-value" title="${filePath}"`)
  expect(html).toContain(`>${filePath}</code>`)
  expect(html).not.toContain('aria-label="复制路径"')
})

test("renders directory read output as raw text even when display metadata is available", () => {
  const directory = "/Users/example/workspace/a-very-long-project-name/src"
  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <ToolPart
            part={{
              id: "prt_read_directory",
              type: "tool",
              tool: "read",
              status: "completed",
              input: { filePath: directory },
              output: `<path>${directory}</path>\n<type>directory</type>\n<entries>\nmain/\n\n(1 entries)\n</entries>`,
              metadata: {
                display: {
                  type: "directory",
                  path: directory,
                  entries: ["main/"],
                  offset: 1,
                  totalEntries: 1,
                  truncated: false,
                },
              },
            }}
          />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).not.toContain('data-component="tool-directory-output"')
  expect(html).toContain(`&lt;path&gt;${directory}&lt;/path&gt;`)
  expect(html).toContain("&lt;type&gt;directory&lt;/type&gt;")
  expect(html).toContain("main/")
})

test("hides pending status text and keeps failed status text", () => {
  const pending = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <ToolPart part={{ id: "prt_pending", type: "tool", tool: "read", status: "pending" }} />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )
  const failed = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <ToolPart part={{ id: "prt_failed", type: "tool", tool: "read", status: "failed", error: "File not found" }} />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(pending).not.toContain(">等待中</span>")
  expect(pending).toContain('data-status="pending"')
  expect(failed).toContain(">失败</span>")
  expect(failed).toContain('data-status="failed"')
})

test("describes a todo update with total and separate progress sections", () => {
  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <ToolPart
            part={{
              id: "prt_todo",
              type: "tool",
              tool: "todowrite",
              status: "completed",
              input: {
                todos: [
                  { content: "Create controller", status: "in_progress" },
                  { content: "Add error handling", status: "pending" },
                  { content: "Create database script", status: "pending" },
                  { content: "Write README", status: "pending" },
                  { content: "Create project", status: "completed" },
                  { content: "Create entities", status: "completed" },
                  { content: "Create repository", status: "completed" },
                  { content: "Create service", status: "completed" },
                ],
              },
            }}
          />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).toContain("8 项")
  expect(html).not.toContain(">已更新</span>")
  expect(html).toContain(">进行中</span>")
  expect(html).toContain(">待处理</span>")
  expect(html).toContain(">已完成</span>")
  expect(html).not.toContain("4 todos")
})
