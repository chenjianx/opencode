import type { RaccoonMessage, RaccoonMessagePart, RaccoonPartUpdate, RaccoonSubAgentView } from "../protocol"

export function messageText(parts: RaccoonMessagePart[]) {
  return parts
    .filter((part) => part.type === "text" && !part.synthetic)
    .map((part) => part.text ?? "")
    .filter(Boolean)
    .join("\n\n")
}

function textPart(update: RaccoonPartUpdate): RaccoonMessagePart {
  if (update.part.type === "reasoning") return { ...update.part, text: update.delta?.textDelta ?? update.part.text ?? "" }
  return {
    ...update.part,
    type: "text",
    text: update.delta?.textDelta ?? update.part.text ?? "",
  }
}

function applyPartUpdate(message: RaccoonMessage, update: RaccoonPartUpdate) {
  const existing = message.parts.find((part) => part.id === update.part.id)
  const parts = existing
    ? message.parts.map((part) => {
        if (part.id !== update.part.id) return part
        if (update.delta?.type !== "text-delta") return update.part
        if (part.type !== "text" && part.type !== "reasoning") return update.part
        return { ...part, text: `${part.text ?? ""}${update.delta.textDelta}` }
      })
    : [...message.parts, textPart(update)].sort((a, b) => a.id.localeCompare(b.id))
  return {
    ...message,
    parts,
    text: messageText(parts),
  }
}

export function applyPartUpdates(messages: RaccoonMessage[], updates: RaccoonPartUpdate[], sessionID: string | undefined) {
  if (updates.length === 0) return messages
  return updates.filter((update) => update.sessionID === sessionID).reduce((next, update) => {
    if (!next.some((message) => message.id === update.messageID)) return next
    return next.map((message) => (message.id === update.messageID ? applyPartUpdate(message, update) : message))
  }, messages)
}

export function mergeSubAgentView(current: RaccoonSubAgentView | undefined, incoming: RaccoonSubAgentView) {
  return {
    ...incoming,
    busy: incoming.busy ?? (current?.sessionID === incoming.sessionID ? current.busy : undefined),
  }
}
