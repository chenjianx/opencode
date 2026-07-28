import type { Message, Part, Session } from "@opencode-ai/sdk/v2/client"
import type {
  RaccoonContextBreakdownKey,
  RaccoonContextInspectorSnapshot,
} from "@opencode-ai/raccoon-webview"
import type { SessionMessageWithParts } from "./mapping.js"

const estimateTokens = (characters: number) => Math.ceil(characters / 4)

export function contextInspectorSnapshot(
  session: Session,
  messages: SessionMessageWithParts[],
  truncated: boolean,
): RaccoonContextInspectorSnapshot {
  const sorted = [...messages].sort(
    (a, b) => a.info.time.created - b.info.time.created || a.info.id.localeCompare(b.info.id),
  )
  const visibleUserMessages = sorted
    .map((message) => message.info)
    .filter((message) => message.role === "user")
    .filter((message) => !session.revert?.messageID || message.id < session.revert.messageID)
  const systemPrompt = [...visibleUserMessages]
    .reverse()
    .map((message) => message.system?.trim())
    .find((system): system is string => !!system)
  const assistant = [...sorted]
    .reverse()
    .map((message) => message.info)
    .find((message) => message.role === "assistant" && messageTokenTotal(message) > 0)

  return {
    session: {
      id: session.id,
      title: session.title,
      createdAt: session.time.created,
      updatedAt: session.time.updated,
      cost: session.cost ?? 0,
    },
    model:
      assistant?.role === "assistant"
        ? { providerID: assistant.providerID, modelID: assistant.modelID }
        : undefined,
    usage: assistant?.role === "assistant" ? assistant.tokens : undefined,
    breakdown: estimateBreakdown(sorted, assistant?.role === "assistant" ? assistant.tokens.input : 0, systemPrompt),
    systemPrompt,
    messages: sorted.map((message) => ({
      id: message.info.id,
      role: message.info.role,
      createdAt: message.info.time.created,
      raw: JSON.stringify({ message: message.info, parts: message.parts }, null, 2),
    })),
    truncated,
  }
}

function messageTokenTotal(message: Message) {
  if (message.role !== "assistant") return 0
  if (typeof message.tokens.total === "number" && message.tokens.total > 0) return message.tokens.total
  return (
    message.tokens.input +
    message.tokens.output +
    message.tokens.reasoning +
    message.tokens.cache.read +
    message.tokens.cache.write
  )
}

function estimateBreakdown(messages: SessionMessageWithParts[], input: number, systemPrompt?: string) {
  if (!input) return []
  const characters = messages.reduce(
    (counts, message) => {
      if (message.info.role === "user") {
        return {
          ...counts,
          user: counts.user + message.parts.reduce((sum, part) => sum + userPartCharacters(part), 0),
        }
      }
      if (message.info.role !== "assistant") return counts
      const assistant = message.parts.reduce(
        (sum, part) => {
          const next = assistantPartCharacters(part)
          return { assistant: sum.assistant + next.assistant, tool: sum.tool + next.tool }
        },
        { assistant: 0, tool: 0 },
      )
      return {
        ...counts,
        assistant: counts.assistant + assistant.assistant,
        tool: counts.tool + assistant.tool,
      }
    },
    { system: systemPrompt?.length ?? 0, user: 0, assistant: 0, tool: 0 },
  )
  const tokens = {
    system: estimateTokens(characters.system),
    user: estimateTokens(characters.user),
    assistant: estimateTokens(characters.assistant),
    tool: estimateTokens(characters.tool),
  }
  const estimated = tokens.system + tokens.user + tokens.assistant + tokens.tool
  if (estimated <= input) return buildBreakdown({ ...tokens, other: input - estimated }, input)

  const scale = input / estimated
  const scaled = {
    system: Math.floor(tokens.system * scale),
    user: Math.floor(tokens.user * scale),
    assistant: Math.floor(tokens.assistant * scale),
    tool: Math.floor(tokens.tool * scale),
  }
  return buildBreakdown(
    { ...scaled, other: input - scaled.system - scaled.user - scaled.assistant - scaled.tool },
    input,
  )
}

function userPartCharacters(part: Part) {
  if (part.type === "text") return part.text.length
  if (part.type === "file") return part.source?.text.value.length ?? 0
  if (part.type === "agent") return part.source?.value.length ?? 0
  return 0
}

function assistantPartCharacters(part: Part) {
  if (part.type === "text" || part.type === "reasoning") return { assistant: part.text.length, tool: 0 }
  if (part.type !== "tool") return { assistant: 0, tool: 0 }
  const input = Object.keys(part.state.input).length * 16
  if (part.state.status === "pending") return { assistant: 0, tool: input + part.state.raw.length }
  if (part.state.status === "completed") return { assistant: 0, tool: input + part.state.output.length }
  if (part.state.status === "error") return { assistant: 0, tool: input + part.state.error.length }
  return { assistant: 0, tool: input }
}

function buildBreakdown(
  tokens: Record<RaccoonContextBreakdownKey, number>,
  input: number,
): RaccoonContextInspectorSnapshot["breakdown"] {
  return (["system", "user", "assistant", "tool", "other"] as const)
    .map((key) => ({ key, tokens: tokens[key] }))
    .filter((segment) => segment.tokens > 0)
    .map((segment) => ({
      ...segment,
      percent: Math.round((segment.tokens / input) * 1000) / 10,
    }))
}
