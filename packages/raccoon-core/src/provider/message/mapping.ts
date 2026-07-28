import type { Message, Part, Provider, Session, SessionV2Info } from "@opencode-ai/sdk/v2/client"
import type {
  RaccoonMessage,
  RaccoonMessagePart,
  RaccoonModel,
  RaccoonProviderInfo,
  RaccoonSession,
  RaccoonSubSession,
} from "@opencode-ai/raccoon-webview"
import { AUTOCOMPLETE_MODELS } from "../../services/autocomplete/models.js"
import { modelKey } from "../session/model-state.js"

const autocompleteModelIDs = new Set(AUTOCOMPLETE_MODELS.map((model) => model.id))

export type SessionMessageWithParts = {
  info: Message
  parts: Part[]
}

export function messageText(parts: RaccoonMessagePart[]) {
  return parts
    .filter((part) => part.type === "text" && !part.synthetic)
    .map((part) => part.text ?? "")
    .filter(Boolean)
    .join("\n\n")
}

export function responseText(parts: RaccoonMessagePart[]) {
  return parts
    .filter((part) => part.type === "text" && !part.synthetic)
    .map((part) => part.text ?? "")
    .join("\n")
    .trim()
}

export function sortMessages(messages: RaccoonMessage[]) {
  return [...messages].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

export function sortSessions(sessions: RaccoonSession[]) {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id))
}

export function sortParts(parts: RaccoonMessagePart[]) {
  return [...parts].sort((a, b) => a.id.localeCompare(b.id))
}

export function mapSession(session: Session): RaccoonSession {
  return {
    id: session.id,
    title: session.title,
    parentID: session.parentID,
    agent: session.agent,
    updatedAt: session.time.updated,
    revert: session.revert,
  }
}

export function mapSessionV2(session: SessionV2Info): RaccoonSession {
  return {
    id: session.id,
    title: session.title,
    parentID: session.parentID,
    agent: session.agent,
    updatedAt: session.time.updated,
    revert: session.revert,
  }
}

export function mapPart(part: Part): RaccoonMessagePart {
  if (part.type === "text" || part.type === "reasoning") {
    return {
      id: part.id,
      type: part.type,
      text: part.text,
      synthetic: "synthetic" in part ? part.synthetic : undefined,
      ignored: "ignored" in part ? part.ignored : undefined,
    }
  }
  if (part.type === "tool") {
    const status = part.state.status
    const input = part.state.input
    const metadata = "metadata" in part.state ? part.state.metadata : part.metadata
    return {
      id: part.id,
      type: "tool",
      tool: part.tool,
      status,
      title: "title" in part.state && part.state.title ? part.state.title : undefined,
      input,
      output: "output" in part.state ? part.state.output : undefined,
      error: "error" in part.state ? part.state.error : undefined,
      metadata,
    }
  }
  return {
    id: part.id,
    type:
      part.type === "step-start" ||
      part.type === "step-finish" ||
      part.type === "snapshot" ||
      part.type === "patch" ||
      part.type === "agent" ||
      part.type === "subtask" ||
      part.type === "file"
        ? part.type
        : "other",
    title: part.type === "file" ? part.filename ?? "file" : part.type,
    mime: part.type === "file" ? part.mime : undefined,
    filename: part.type === "file" ? part.filename : undefined,
    url: part.type === "file" ? part.url : undefined,
    path: part.type === "file" && part.source?.type === "file" ? part.source.path : undefined,
  }
}

export function mapMessage(message: SessionMessageWithParts): RaccoonMessage[] {
  const base = { id: message.info.id, createdAt: message.info.time.created }
  if (message.info.role === "user") {
    const parts = message.parts.map((part) => mapPart(part))
    return [
      {
        ...base,
        role: "user",
        parts,
        text: messageText(parts),
      },
    ]
  }
  if (message.info.role === "assistant") {
    const parts = message.parts.map((part) => mapPart(part))
    return [
      {
        ...base,
        role: "assistant",
        parts,
        text: messageText(parts),
        tokens: message.info.tokens,
        cost: message.info.cost,
      },
    ]
  }
  return []
}

// Derive a compact progress view of a subagent (task) child session from its raw
// messages, so the webview can render its tool activity, count, and duration without
// holding the full child-session message tree. Mirrors the TUI Task component logic.
export function mapSubSession(
  sessionID: string,
  messages: SessionMessageWithParts[],
  status: string,
): RaccoonSubSession {
  const sorted = [...messages].sort(
    (a, b) => a.info.time.created - b.info.time.created || a.info.id.localeCompare(b.info.id),
  )
  const tools: RaccoonSubSession["tools"] = []
  for (const message of sorted) {
    for (const part of message.parts) {
      if (part.type !== "tool") continue
      const sessionID = "metadata" in part.state && typeof part.state.metadata?.sessionId === "string" ? part.state.metadata.sessionId : undefined
      tools.push({
        id: part.id,
        tool: part.tool,
        sessionID: part.tool === "task" ? sessionID : undefined,
        status: part.state.status,
        title: "title" in part.state && part.state.title ? part.state.title : undefined,
      })
    }
  }
  const startedAt = sorted.find((message) => message.info.role === "user")?.info.time.created
  const completedAt = [...sorted]
    .reverse()
    .map((message) => (message.info.role === "assistant" ? message.info.time.completed : undefined))
    .find((value): value is number => typeof value === "number")
  return {
    sessionID,
    status,
    tools,
    toolcalls: tools.length,
    startedAt,
    completedAt,
  }
}

export function mapProviderModels(provider: Provider, connected: boolean, disabledModels: Set<string>): RaccoonModel[] {
  const selectable = connected || provider.source === "config"
  return Object.values(provider.models)
    .filter((model) => !autocompleteModelIDs.has(model.id))
    .map((model) => ({
      providerID: provider.id,
      providerName: provider.name,
      modelID: model.id,
      modelName: model.name.replace("(latest)", "").trim(),
      source: provider.source,
      connected: selectable,
      enabled: !disabledModels.has(modelKey({ providerID: provider.id, modelID: model.id })),
      contextLimit: model.limit?.context && model.limit.context > 0 ? model.limit.context : undefined,
      variants: Object.keys(model.variants ?? {}),
    }))
    .sort((a, b) => a.modelName.localeCompare(b.modelName))
}

export function mapProviders(providers: Provider[], connected: Set<string>, models: RaccoonModel[]): RaccoonProviderInfo[] {
  return providers
    .map((provider) => {
      const items = models.filter((model) => model.providerID === provider.id)
      return {
        id: provider.id,
        name: provider.name,
        source: provider.source,
        connected: connected.has(provider.id) || provider.source === "config",
        modelCount: items.length,
        enabledModelCount: items.filter((model) => model.enabled).length,
      }
    })
    .sort((a, b) => Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name))
}

export function recountProviders(providers: RaccoonProviderInfo[], models: RaccoonModel[]) {
  return providers.map((provider) => ({
    ...provider,
    modelCount: models.filter((model) => model.providerID === provider.id).length,
    enabledModelCount: models.filter((model) => model.providerID === provider.id && model.enabled).length,
  }))
}
