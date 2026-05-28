import type { Message, Part, Provider, Session } from "@opencode-ai/sdk/v2/client"
import type { RaccoonMessage, RaccoonMessagePart, RaccoonModel, RaccoonProviderInfo, RaccoonSession } from "@opencode-ai/raccoon-webview"
import { modelKey } from "./model-state.js"

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
      },
    ]
  }
  return []
}

export function mapProviderModels(provider: Provider, connected: boolean, disabledModels: Set<string>): RaccoonModel[] {
  const selectable = connected || provider.source === "config"
  return Object.values(provider.models)
    .map((model) => ({
      providerID: provider.id,
      providerName: provider.name,
      modelID: model.id,
      modelName: model.name.replace("(latest)", "").trim(),
      source: provider.source,
      connected: selectable,
      enabled: !disabledModels.has(modelKey({ providerID: provider.id, modelID: model.id })),
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
