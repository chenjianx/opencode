import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ArrowClockwiseIcon, ArrowDownIcon, ArrowUUpLeftIcon } from "@phosphor-icons/react"
import { useLanguage } from "../context/language"
import { useSession } from "../context/session"
import type { RaccoonMessage, RaccoonMessagePart } from "../protocol"
import { MarkdownLite } from "./markdown-lite"

type Turn = {
  user?: RaccoonMessage
  assistant: RaccoonMessage[]
}

type TodoItem = {
  content: string
  status: string
}

function turns(messages: RaccoonMessage[]) {
  return messages.reduce<Turn[]>((result, message) => {
    if (message.role === "user") {
      result.push({ user: message, assistant: [] })
      return result
    }
    if (message.role === "assistant") {
      const latest = result.at(-1)
      if (latest) {
        latest.assistant.push(message)
        return result
      }
      result.push({ assistant: [message] })
    }
    return result
  }, [])
}

function visibleParts(message: RaccoonMessage) {
  return (message.parts ?? []).filter(
    (part) =>
      part.type !== "step-start" &&
      part.type !== "step-finish" &&
      !part.synthetic &&
      (part.type !== "text" || part.text?.trim()),
  )
}

function filename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function shortValue(value: unknown) {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (value === null || value === undefined) return ""
  return JSON.stringify(value)
}

function preview(value: string, length = 420) {
  const text = value.trim()
  if (text.length <= length) return text
  return `${text.slice(0, length)}...`
}

function stripAnsi(value: string) {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
}

function formatToolOutput(part: RaccoonMessagePart, output: string) {
  const tool = part.tool ?? ""
  const text = stripAnsi(output).trim()
  if (tool === "bash") {
    const command = firstString(part.input, ["command", "cmd"])
    return command && !text.startsWith("$ ") ? `$ ${command}${text ? `\n\n${text}` : ""}` : text
  }
  return text
}

function looksLikeTableLine(value: string) {
  return /^\s*\|.*\|\s*$/.test(value) || /\S+\s{2,}\S+/.test(value)
}

function splitThinkBlocks(text: string) {
  const blocks: Array<{ type: "reasoning" | "text"; text: string }> = []
  const pattern = /<think>([\s\S]*?)<\/think>/gi
  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    if (match.index > last) {
      const before = text.slice(last, match.index)
      if (before.trim()) blocks.push({ type: "text", text: before })
    }
    const thinking = match[1]?.trim()
    if (thinking) blocks.push({ type: "reasoning", text: thinking })
    last = match.index + match[0].length
  }

  if (last < text.length) {
    const tail = text.slice(last)
    if (tail.trim()) blocks.push({ type: "text", text: tail })
  }

  return blocks.length > 0 ? blocks : [{ type: "text", text }]
}

function AssistantText(props: { id: string; text: string; onOpenFile?: (filePath: string, line?: number, column?: number) => void }) {
  return (
    <div className="assistant-text-blocks">
      {splitThinkBlocks(props.text).map((block, index) => {
        if (block.type === "reasoning") {
          return (
            <details className="assistant-reasoning" key={`${props.id}-think-${index}`}>
              <summary>Thinking</summary>
              <MarkdownLite text={block.text} onOpenFile={props.onOpenFile} />
            </details>
          )
        }
        return <MarkdownLite key={`${props.id}-text-${index}`} text={block.text} onOpenFile={props.onOpenFile} />
      })}
    </div>
  )
}

function MarkdownOutput(props: { text: string }) {
  const lines = props.text.split("\n")
  return (
    <div className="tool-markdown">
      {lines.map((line, index) => {
        if (!line.trim()) return <div className="tool-md-space" key={index} />
        if (/^#{1,6}\s+/.test(line)) return <div className="tool-md-heading" key={index}>{line.replace(/^#{1,6}\s+/, "")}</div>
        if (/^\s*[-*]\s+/.test(line)) return <div className="tool-md-list" key={index}>{line.replace(/^\s*[-*]\s+/, "")}</div>
        if (/^\s*\d+\.\s+/.test(line)) return <div className="tool-md-list" key={index}>{line.replace(/^\s*\d+\.\s+/, "")}</div>
        if (looksLikeTableLine(line)) return <pre className="tool-md-code" key={index}>{line}</pre>
        return <div className="tool-md-line" key={index}>{line}</div>
      })}
    </div>
  )
}

function ToolOutput(props: { part: RaccoonMessagePart; output: string }) {
  const text = formatToolOutput(props.part, props.output)
  if (props.part.tool === "bash") {
    return (
      <div data-component="bash-output" className="tool-output-shell">
        <div data-slot="bash-scroll">
          <pre data-slot="bash-pre">
            <code>{text}</code>
          </pre>
        </div>
      </div>
    )
  }
  if (props.part.tool === "list" || props.part.tool === "glob" || props.part.tool === "grep") {
    return (
      <div data-component="tool-output" data-scrollable className="tool-output-markdown">
        <MarkdownOutput text={text} />
      </div>
    )
  }
  return (
    <div data-component="tool-output" data-scrollable>
      <pre className="tool-output-plain">{text}</pre>
    </div>
  )
}

function inputLines(part: RaccoonMessagePart) {
  return Object.entries(part.input ?? {})
    .map(([key, value]) => {
      const text = shortValue(value)
      if (!text) return
      return { key, value: preview(text, 180) }
    })
    .filter((item): item is { key: string; value: string } => !!item)
}

function firstString(input: Record<string, unknown> | undefined, keys: string[]) {
  return keys.map((key) => input?.[key]).find((value): value is string => typeof value === "string" && value.trim().length > 0)
}

function todoStatus(value: unknown) {
  if (typeof value !== "string") return "pending"
  const normalized = value.toLowerCase().replace(/[\s-]+/g, "_")
  if (normalized === "completed" || normalized === "complete" || normalized === "done") return "completed"
  if (normalized === "in_progress" || normalized === "inprogress" || normalized === "running") return "in_progress"
  if (normalized === "cancelled" || normalized === "canceled" || normalized === "skipped") return "completed"
  return "pending"
}

function todoItems(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return
      const record = item as Record<string, unknown>
      const content = typeof record.content === "string" ? record.content.trim() : typeof record.text === "string" ? record.text.trim() : ""
      if (!content) return
      return { content, status: todoStatus(record.status) }
    })
    .filter((item): item is TodoItem => !!item)
}

function parseTodoJson(text: string) {
  try {
    const value = JSON.parse(text)
    return todoItems(Array.isArray(value) ? value : value && typeof value === "object" ? (value as Record<string, unknown>).todos : undefined)
  } catch {
    return []
  }
}

function parseTodoMarkdown(text: string) {
  return text
    .split("\n")
    .map((line) => {
      const match = line.match(/^\s*(?:[-*]|\d+\.)\s*(?:\[( |x|X|✓|✔|•|~|-)\]\s*)?(.+?)\s*$/)
      if (!match) return
      const mark = match[1]
      const content = match[2]?.trim()
      if (!content) return
      return {
        content,
        status: mark?.toLowerCase() === "x" || mark === "✓" || mark === "✔" ? "completed" : mark === "•" ? "in_progress" : "pending",
      }
    })
    .filter((item): item is TodoItem => !!item)
}

function todosFromPart(part: RaccoonMessagePart) {
  const inputTodos = todoItems(part.input?.todos)
  if (inputTodos.length > 0) return inputTodos
  const output = part.output ?? part.error
  if (!output) return []
  const text = stripAnsi(output).trim()
  const jsonTodos = parseTodoJson(text)
  return jsonTodos.length > 0 ? jsonTodos : parseTodoMarkdown(text)
}

function isTodoTool(part: RaccoonMessagePart) {
  return part.tool === "todowrite" || part.tool === "todoread" || part.tool === "task"
}

function TodoOutput(props: { todos: TodoItem[] }) {
  const active = props.todos.filter((item) => item.status !== "completed")
  const completed = props.todos.filter((item) => item.status === "completed")
  const sections = [
    { key: "active", title: "待办", items: active },
    { key: "completed", title: "已完成", items: completed },
  ].filter((section) => section.items.length > 0)

  return (
    <div className="todo-output">
      {sections.map((section) => (
        <section className="todo-section" key={section.key}>
          <div className="todo-section-header">
            <span>{section.title}</span>
            <span>{section.items.length}</span>
          </div>
          <div className="todo-list">
            {section.items.map((item, index) => (
              <div className={`todo-row ${item.status}`} key={`${section.key}-${index}-${item.content}`}>
                <span className="todo-mark">{item.status === "completed" ? "✓" : item.status === "in_progress" ? "•" : ""}</span>
                <span className="todo-content">{item.content}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function toolLabel(tool: string, t: ReturnType<typeof useLanguage>["t"]) {
  const keys = {
    read: "tool.read",
    list: "tool.list",
    glob: "tool.glob",
    grep: "tool.grep",
    webfetch: "tool.webfetch",
    websearch: "tool.websearch",
    bash: "tool.shell",
    edit: "tool.edit",
    write: "tool.write",
    apply_patch: "tool.patch",
    patch: "tool.patch",
    todoread: "tool.loaded",
    todowrite: "tool.todos",
    question: "tool.questions",
    task: "tool.task",
    skill: "tool.skill",
  } as const
  return tool in keys ? t(keys[tool as keyof typeof keys]) : tool
}

function toolInfo(part: RaccoonMessagePart, t: ReturnType<typeof useLanguage>["t"]) {
  const tool = part.tool ?? "tool"
  const label = toolLabel(tool, t)
  const file = firstString(part.input, ["filePath", "filepath", "file", "target_file"])
  if (file && (tool === "read" || tool === "edit" || tool === "write")) {
    return { title: label, subtitle: filename(file) }
  }
  if (file) return { title: label, subtitle: filename(file) }
  if (tool === "list") return { title: label, subtitle: firstString(part.input, ["path", "directory", "cwd"]) }
  if (tool === "glob" || tool === "grep") return { title: label, subtitle: firstString(part.input, ["pattern", "query", "regex"]) }
  if (tool === "bash") return { title: label, subtitle: firstString(part.input, ["description"]) ?? firstString(part.input, ["command", "cmd"]) }
  return {
    title: label,
    subtitle: firstString(part.input, ["description", "prompt", "query", "url"]) ?? part.title,
  }
}

function ToolPart(props: { part: RaccoonMessagePart }) {
  const language = useLanguage()
  const lines = inputLines(props.part)
  const output = props.part.error ?? props.part.output
  const todos = isTodoTool(props.part) ? todosFromPart(props.part) : []
  const hasDetails = lines.length > 0 || !!output || !!props.part.metadata
  const info = toolInfo(props.part, language.t)

  if (todos.length > 0) {
    return (
      <details className={`tool-part todo-part ${props.part.error ? "errored" : ""}`} open>
        <summary data-component="tool-trigger">
          <span data-slot="basic-tool-tool-trigger-content">
            <span className="tool-dot" />
            <span data-slot="basic-tool-tool-info">
              <span data-slot="basic-tool-tool-info-structured">
                <span data-slot="basic-tool-tool-info-main">
                  <span data-slot="basic-tool-tool-title">{info.title}</span>
                  {info.subtitle ? <span data-slot="basic-tool-tool-subtitle">{info.subtitle}</span> : null}
                </span>
                {props.part.status ? <span data-slot="basic-tool-tool-arg">{props.part.status}</span> : null}
              </span>
            </span>
          </span>
        </summary>
        <div data-slot="collapsible-content" className="tool-details">
          <TodoOutput todos={todos} />
        </div>
      </details>
    )
  }

  return (
    <details className={`tool-part ${props.part.error ? "errored" : ""}`} open={props.part.status === "running"}>
      <summary data-component="tool-trigger">
        <span data-slot="basic-tool-tool-trigger-content">
          <span className="tool-dot" />
          <span data-slot="basic-tool-tool-info">
            <span data-slot="basic-tool-tool-info-structured">
              <span data-slot="basic-tool-tool-info-main">
                <span data-slot="basic-tool-tool-title">{info.title}</span>
                {info.subtitle ? <span data-slot="basic-tool-tool-subtitle">{info.subtitle}</span> : null}
              </span>
              {props.part.status ? <span data-slot="basic-tool-tool-arg">{props.part.status}</span> : null}
            </span>
          </span>
        </span>
        {hasDetails ? <span className="tool-arrow">⌄</span> : null}
      </summary>
      {hasDetails ? (
        <div data-slot="collapsible-content" className="tool-details">
          {lines.length > 0 ? (
            <div className="tool-section">
              <div className="tool-section-title">{language.t("tool.section.input")}</div>
              {lines.map((line) => (
                <div className="tool-kv" key={line.key}>
                  <span>{line.key}</span>
                  <code>{line.value}</code>
                </div>
              ))}
            </div>
          ) : null}
          {output ? (
            <div className="tool-section">
              <div className="tool-section-title">
                {props.part.error ? language.t("tool.section.error") : language.t("tool.section.output")}
              </div>
              <ToolOutput part={props.part} output={output} />
            </div>
          ) : null}
        </div>
      ) : null}
    </details>
  )
}

function UserMessage(props: { message: RaccoonMessage; disabled?: boolean; onRevert?: () => void }) {
  const text = props.message.parts.filter((part) => part.type === "text" && !part.synthetic).map((part) => part.text ?? "").join("\n\n").trim()
  if (!text) return null

  return (
    <div className="user-message-row">
      {props.onRevert ? (
        <button type="button" className="user-revert-button" onClick={props.onRevert} disabled={props.disabled} aria-label="Revert message">
          <ArrowUUpLeftIcon size={14} />
        </button>
      ) : null}
      <p>
        {text.split(/(@\S+)/g).map((part, index) =>
          part.startsWith("@") ? <span className="user-mention" key={index}>{part}</span> : part,
        )}
      </p>
    </div>
  )
}

function RevertBar(props: { items: RaccoonMessage[] }) {
  const session = useSession()
  const language = useLanguage()
  const [first, ...rest] = props.items
  if (!first) return null

  return (
    <div className="revert-bar">
      <div className="revert-bar-head">
        <span>{language.t("revert.title", { count: props.items.length })}</span>
        <button
          type="button"
          className="revert-bar-action"
          onClick={() => session.restoreRevertedMessage(first.id)}
          disabled={session.state.busy}
          aria-label={language.t("revert.restore")}
        >
          <ArrowClockwiseIcon size={14} />
          <span>{language.t("revert.restore")}</span>
        </button>
      </div>
      <div className="revert-bar-list">
        {props.items.map((item) => (
          <div className="revert-bar-row" key={item.id}>
            <span className="revert-bar-text">{item.text || item.id}</span>
            <button
              type="button"
              className="revert-bar-mini"
              onClick={() => session.restoreRevertedMessage(item.id)}
              disabled={session.state.busy}
              aria-label={language.t("revert.restore")}
            >
              <ArrowUUpLeftIcon size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MessageList() {
  const language = useLanguage()
  const session = useSession()
  const messageTurns = turns(session.visibleMessages)
  const rootRef = useRef<HTMLDivElement>(null)
  const followBottomRef = useRef(true)
  const [showScrollBottom, setShowScrollBottom] = useState(false)

  const updateScrollButton = () => {
    const root = rootRef.current
    if (!root) return
    const atBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 48
    followBottomRef.current = atBottom
    setShowScrollBottom(!atBottom)
  }

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (!followBottomRef.current) {
      updateScrollButton()
      return
    }
    root.scrollTo({ top: root.scrollHeight, behavior: "auto" })
    setShowScrollBottom(false)
    followBottomRef.current = true
  }, [session.messages, session.state.loading])

  const scrollToBottom = () => {
    const root = rootRef.current
    if (!root) return
    root.scrollTo({ top: root.scrollHeight, behavior: "smooth" })
    setShowScrollBottom(false)
    followBottomRef.current = true
  }

  return (
    <div className="message-list-shell">
      <div className="message-list" ref={rootRef} onScroll={updateScrollButton}>
        {session.state.error ? <div className="message-shell error">{session.state.error}</div> : null}
        {!session.state.activeSessionID && !session.state.loading && session.messages.length === 0 ? (
          <div className="welcome-state">
            <div className="welcome-card">
              <div className="welcome-top">
                <div className="welcome-mark">R</div>
                <div className="welcome-title">小浣熊</div>
              </div>
              <p className="welcome-copy">
                欢迎你 <span className="welcome-mention">@RaccoonEthan</span>，我是代码小浣熊，您的代码助手。您可以让我与您一起编写代码，或向我询问任何技术问题。
              </p>
              <div className="welcome-tip">
                <span className="welcome-tip-icon">◉</span>
                <span>您可以使用以下快捷键来提高效率：</span>
              </div>
              <ul className="welcome-list">
                <li>使用 <kbd>⌘L</kbd> 快速唤醒助手</li>
                <li>输入 <kbd>@</kbd> 添加任务背景上下文，帮助我更好地理解您的需求</li>
                <li>输入 <kbd>/</kbd> 查看更多快捷操作。</li>
              </ul>
              <p className="welcome-footer">
                访问 <a href="#" onClick={(event) => event.preventDefault()}>小浣熊官网</a> 查看官方使用教程。
              </p>
            </div>
          </div>
        ) : null}
        {messageTurns.map((turn, index) => (
          <article className="session-turn" key={turn.user?.id ?? turn.assistant[0]?.id ?? index}>
            {turn.user ? (
              <div className="turn-user">
                <div className="turn-role">You</div>
                <UserMessage
                  message={turn.user}
                  disabled={session.state.busy}
                  onRevert={turn.assistant.length > 0 ? () => session.revertSession(turn.user!.id) : undefined}
                />
              </div>
            ) : null}
            {turn.assistant.map((message) => (
              <div className="turn-assistant" key={message.id}>
                <div className="turn-role">Raccoon</div>
                {visibleParts(message).length > 0 ? (
                  <div className="assistant-parts">
                    {visibleParts(message)
                      .map((part) => {
                        if (part.type === "text") {
                          return <AssistantText key={part.id} id={part.id} text={part.text ?? ""} onOpenFile={session.openFile} />
                        }
                        if (part.type === "reasoning") {
                          return (
                            <details className="assistant-reasoning" key={part.id}>
                              <summary>Thinking</summary>
                              <p>{part.text}</p>
                            </details>
                          )
                        }
                        if (part.type === "tool") {
                          return <ToolPart part={part} key={part.id} />
                        }
                        return (
                          <div className="tool-part muted" key={part.id}>
                            <span className="tool-dot" />
                            <span className="tool-name">{part.title ?? part.type}</span>
                          </div>
                        )
                      })}
                    {!(message.parts ?? []).some((part) => part.type === "text" && part.text?.trim()) && message.text.trim() ? (
                      <AssistantText id={message.id} text={message.text} onOpenFile={session.openFile} />
                    ) : null}
                  </div>
                ) : (
                  <AssistantText id={message.id} text={message.text} onOpenFile={session.openFile} />
                )}
              </div>
            ))}
          </article>
        ))}
        {session.revertedMessages.length > 0 ? <RevertBar items={session.revertedMessages} /> : null}
        {session.state.loading ? (
          <div className="working-indicator">
            <span className="working-dot" />
            <span>Raccoon is working...</span>
          </div>
        ) : null}
      </div>
      {showScrollBottom ? (
        <button
          type="button"
          className="message-scroll-bottom"
          onClick={scrollToBottom}
          aria-label={language.t("message.scrollToBottom")}
        >
          <ArrowDownIcon size={18} weight="bold" />
        </button>
      ) : null}
    </div>
  )
}
