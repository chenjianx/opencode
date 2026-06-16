import type { Message, Part, Session } from "@opencode-ai/sdk/v2/client"

function exportText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function fencedCode(text: string) {
  return `~~~\n${text.trim()}\n~~~`
}

function markdownPart(part: Part) {
  if (part.type === "text") {
    const text = exportText(part.text)
    if (!text) return []
    return [text]
  }
  if (part.type === "reasoning") {
    const text = exportText(part.text)
    if (!text) return []
    return [`> Thinking\n>\n${text.split("\n").map((line) => `> ${line}`).join("\n")}`]
  }
  if (part.type === "tool") {
    const lines = [`#### Tool: ${part.tool}`]
    if ("title" in part.state && part.state.title) lines.push(`- Title: ${part.state.title}`)
    lines.push(`- Status: ${part.state.status}`)
    const input = JSON.stringify(part.state.input, null, 2)
    if (input !== "{}") lines.push(`\n**Input**\n${fencedCode(input)}`)
    if ("output" in part.state && exportText(part.state.output)) lines.push(`\n**Output**\n${fencedCode(part.state.output)}`)
    if ("error" in part.state && exportText(part.state.error)) lines.push(`\n**Error**\n${fencedCode(part.state.error)}`)
    return lines
  }
  if (part.type === "file") {
    const lines = [`- File: ${part.filename ?? part.url}`]
    if (part.source && "path" in part.source) lines.push(`- Source: ${part.source.path}`)
    return lines
  }
  if (part.type === "subtask") return [`- Subtask: ${part.description}`, exportText(part.prompt) ? fencedCode(part.prompt) : undefined].filter(Boolean)
  if (part.type === "patch") return [`- Patch: ${part.hash}`, part.files.length > 0 ? `- Files: ${part.files.join(", ")}` : undefined].filter(Boolean)
  if (part.type === "snapshot") return [`- Snapshot: ${part.snapshot}`]
  if (part.type === "step-start") return part.snapshot ? [`- Step start`, `- Snapshot: ${part.snapshot}`] : ["- Step start"]
  if (part.type === "step-finish") return [`- Step finish`, `- Reason: ${part.reason}`, `- Cost: ${part.cost}`]
  if (part.type === "agent") return [`- Agent: ${part.name}`, part.source ? `- Source: ${part.source.value}` : undefined].filter(Boolean)
  if (part.type === "compaction") return [`- Compaction: ${part.auto ? "auto" : "manual"}`]
  return []
}

export function exportMarkdown(data: { info: Session; messages: Array<{ info: Message; parts: Part[] }> }) {
  const lines = [
    `# ${data.info.title}`,
    "",
    `- Session ID: ${data.info.id}`,
    `- Agent: ${data.info.agent ?? "default"}`,
    `- Created: ${new Date(data.info.time.created).toLocaleString()}`,
    `- Updated: ${new Date(data.info.time.updated).toLocaleString()}`,
  ]

  if (data.info.directory) lines.push(`- Directory: ${data.info.directory}`)
  if (data.info.projectID) lines.push(`- Project ID: ${data.info.projectID}`)
  if (data.info.summary) {
    lines.push("")
    lines.push("## Summary")
    lines.push(`- Files: ${data.info.summary.files}`)
    lines.push(`- Additions: ${data.info.summary.additions}`)
    lines.push(`- Deletions: ${data.info.summary.deletions}`)
  }

  for (const message of data.messages) {
    lines.push("")
    lines.push(`## ${message.info.role === "user" ? "User" : "Assistant"}`)
    lines.push(`- ID: ${message.info.id}`)
    lines.push(`- Created: ${new Date(message.info.time.created).toLocaleString()}`)
    if (message.info.agent) lines.push(`- Agent: ${message.info.agent}`)
    if (message.info.role === "assistant") lines.push(`- Model: ${message.info.providerID}/${message.info.modelID}`)
    const body = message.parts.flatMap((part) => markdownPart(part))
    if (body.length > 0) {
      lines.push("")
      lines.push(...body.filter((line): line is string => line !== undefined))
    }
  }

  return `${lines.join("\n").trim()}\n`
}
