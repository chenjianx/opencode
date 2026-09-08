import { CaretDown, CaretRight } from "@phosphor-icons/react"
import { useLanguage } from "../../../context/language"
import { useSession } from "../../../context/session"
import type { RaccoonMessagePart } from "../../../protocol"
import { MarkdownLite } from "../../ui/markdown-lite"
import { DiffPanel, diffFiles } from "./message-list-diff"
import { filename, firstString, inputLines, isPathInputKey, stripAnsi } from "./message-list-format"
import { QuestionDock } from "./question-dock"

type TodoItem = {
  content: string
  status: string
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
  if (props.part.tool === "task") {
    const task = parseTaskOutput(props.output)
    return (
      <div data-component="tool-output" data-scrollable className="tool-output-markdown">
        {task.summary ? <div className="tool-task-summary">{task.summary}</div> : null}
        <MarkdownLite text={task.text} />
      </div>
    )
  }
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

export function isTodoTool(part: RaccoonMessagePart) {
  return part.tool === "todowrite" || part.tool === "todoread"
}

type TaskOutput = {
  state?: string
  summary?: string
  text: string
}

// The task (subagent) tool wraps its result in an XML envelope produced by
// renderOutput() server-side, e.g.
//   <task id="ses_x" state="completed"><summary>...</summary><task_result>...</task_result></task>
// Extract the inner result/error text so we can render it as markdown instead of
// dumping the raw envelope. Falls back to the raw string when no envelope is present.
export function parseTaskOutput(output: string): TaskOutput {
  const text = stripAnsi(output)
  const stateMatch = text.match(/<task\b[^>]*\bstate="([^"]*)"/)
  const summaryMatch = text.match(/<summary>([\s\S]*?)<\/summary>/)
  const resultMatch = text.match(/<task_(?:result|error)>([\s\S]*?)<\/task_(?:result|error)>/)
  if (!resultMatch) return { text: text.trim() }
  return {
    state: stateMatch?.[1],
    summary: summaryMatch?.[1]?.trim() || undefined,
    text: resultMatch[1]?.trim() ?? "",
  }
}

function TodoOutput(props: { todos: TodoItem[] }) {
  const { t } = useLanguage()
  const inProgress = props.todos.filter((item) => item.status === "in_progress")
  const pending = props.todos.filter((item) => item.status === "pending")
  const completed = props.todos.filter((item) => item.status === "completed")
  const sections = [
    { key: "in_progress", title: t("tool.todo.inProgress"), items: inProgress },
    { key: "pending", title: t("tool.todo.active"), items: pending },
    { key: "completed", title: t("tool.todo.completed"), items: completed },
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
  if (tool === "task") {
    const description = firstString(part.input, ["description"]) ?? part.title
    const agentType = firstString(part.input, ["subagent_type"])
    return {
      title: label,
      subtitle: agentType && description ? `${agentType} · ${description}` : agentType ?? description,
    }
  }
  return {
    title: label,
    subtitle: firstString(part.input, ["description", "prompt", "query", "url"]) ?? part.title,
  }
}

function toolStatusState(status: string | undefined) {
  if (!status) return undefined
  const normalized = status.toLowerCase()
  if (normalized === "completed" || normalized === "complete" || normalized === "done") return "completed"
  if (normalized === "running" || normalized === "in_progress") return "running"
  if (normalized === "pending") return "pending"
  if (normalized === "failed" || normalized === "error") return "failed"
  return normalized
}

function toolStatus(status: string | undefined, t: ReturnType<typeof useLanguage>["t"]) {
  const state = toolStatusState(status)
  if (state === "running") return t("tool.status.running")
  if (state === "failed") return t("tool.status.failed")
  return undefined
}

function toolDuration(startedAt: number | undefined, completedAt: number | undefined) {
  if (startedAt === undefined || completedAt === undefined || completedAt < startedAt) return undefined
  const seconds = Math.max(1, Math.round((completedAt - startedAt) / 1_000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

function ToolEnd(props: { status?: string; arrow?: "expand" | "navigate" }) {
  return (
    <span className="tool-end">
      {props.status ? <span data-slot="basic-tool-tool-arg">{props.status}</span> : null}
      <span className={`tool-arrow${props.arrow ? "" : " placeholder"}`} aria-hidden="true">
        {props.arrow === "expand" ? <CaretDown size={12} weight="bold" /> : null}
        {props.arrow === "navigate" ? <CaretRight size={12} weight="bold" /> : null}
      </span>
    </span>
  )
}

function ToolSummary(props: { info: ReturnType<typeof toolInfo>; status?: string; showArrow?: boolean }) {
  const { t } = useLanguage()
  const status = toolStatus(props.status, t)

  return (
    <summary data-component="tool-trigger">
      <span data-slot="basic-tool-tool-trigger-content">
        <span className="tool-dot" />
        <span data-slot="basic-tool-tool-info">
          <span data-slot="basic-tool-tool-info-structured">
            <span data-slot="basic-tool-tool-info-main">
              <span data-slot="basic-tool-tool-title">{props.info.title}</span>
              {props.info.subtitle ? <span data-slot="basic-tool-tool-subtitle">{props.info.subtitle}</span> : null}
            </span>
          </span>
        </span>
      </span>
      <ToolEnd status={status} arrow={props.showArrow ? "expand" : undefined} />
    </summary>
  )
}

export function ToolPart(props: { part: RaccoonMessagePart }) {
  const language = useLanguage()
  const session = useSession()
  const diffs = props.part.tool === "edit" || props.part.tool === "apply_patch" || props.part.tool === "patch" ? diffFiles(props.part) : []
  const onlyDiff = diffs.length > 0
  const lines = onlyDiff ? [] : inputLines(props.part)
  const output = props.part.error ?? props.part.output
  const todos = isTodoTool(props.part) ? todosFromPart(props.part) : []
  const subSessionID = props.part.tool === "task" ? (props.part.metadata?.sessionId as string | undefined) : undefined
  const hasDetails = onlyDiff || lines.length > 0 || !!output || !!props.part.metadata
  const info = toolInfo(props.part, language.t)
  const activeQuestion = props.part.tool === "question" ? session.questions.find((request) => request.tool?.messageID === props.part.id) : undefined

  if (todos.length > 0) {
    return (
      <details className={`tool-part todo-part ${props.part.error ? "errored" : ""}`} data-status={toolStatusState(props.part.status)} open>
        <ToolSummary info={{ ...info, subtitle: language.t("tool.todo.count", { count: todos.length }) }} status={props.part.status} />
        <div data-slot="collapsible-content" className="tool-details">
          <TodoOutput todos={todos} />
        </div>
      </details>
    )
  }

  // The task (subagent) tool is not expandable inline — its child conversation lives
  // in a dedicated read-only view. Render a single clickable row that opens it.
  if (props.part.tool === "task" && subSessionID) {
    const subSession = session.state.subSessions?.[subSessionID]
    const duration = toolDuration(subSession?.startedAt, subSession?.completedAt)
    const status =
      toolStatus(props.part.status, language.t) ??
      (toolStatusState(props.part.status) === "completed" && subSession
        ? duration
          ? language.t("tool.task.completed", { count: subSession.toolcalls, duration })
          : language.t("tool.task.toolcalls", { count: subSession.toolcalls })
        : undefined)
    return (
      <button
        type="button"
        className={`tool-part task-part task-row ${props.part.error ? "errored" : ""}`}
        data-status={toolStatusState(props.part.status)}
        onClick={() => session.openSubAgent(subSessionID, info.subtitle)}
        title={language.t("tool.task.open")}
      >
        <span data-component="tool-trigger">
          <span data-slot="basic-tool-tool-trigger-content">
            <span className="tool-dot" />
            <span data-slot="basic-tool-tool-info">
              <span data-slot="basic-tool-tool-info-structured">
                <span data-slot="basic-tool-tool-info-main">
                  <span data-slot="basic-tool-tool-title">{info.title}</span>
                  {info.subtitle ? <span data-slot="basic-tool-tool-subtitle">{info.subtitle}</span> : null}
                </span>
              </span>
            </span>
          </span>
        </span>
        <ToolEnd status={status} arrow="navigate" />
      </button>
    )
  }

  return (
    <details className={`tool-part ${props.part.error ? "errored" : ""}`} data-status={toolStatusState(props.part.status)}>
      <ToolSummary info={info} status={props.part.status} showArrow={hasDetails} />
      {hasDetails ? (
        <div data-slot="collapsible-content" className="tool-details">
          {diffs.length > 0 ? (
            <div className="tool-section">
              <DiffPanel files={diffs} />
            </div>
          ) : null}
          {lines.length > 0 ? (
            <div className="tool-section">
              <div className="tool-section-title">{language.t("tool.section.input")}</div>
              {lines.map((line) => (
                <div className="tool-kv" key={line.key}>
                  <span>{line.key}</span>
                  <code
                    className={isPathInputKey(line.key) ? "tool-path-value" : undefined}
                    title={isPathInputKey(line.key) ? line.value : undefined}
                  >
                    {line.value}
                  </code>
                </div>
              ))}
            </div>
          ) : null}
          {output && !activeQuestion && !onlyDiff ? (
            <div className="tool-section">
              <div className="tool-section-title">
                {props.part.error ? language.t("tool.section.error") : language.t("tool.section.output")}
              </div>
              <ToolOutput part={props.part} output={output} />
            </div>
          ) : null}
          {activeQuestion ? <QuestionDock key={activeQuestion.id} request={activeQuestion} /> : null}
        </div>
      ) : null}
    </details>
  )
}
