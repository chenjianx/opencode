import type { Message, Part, Session } from "@opencode-ai/sdk/v2/client"
import type { RaccoonMessage, RaccoonSession } from "@opencode-ai/raccoon-webview"
import { mapMessageInfo, mapPart, mapSession, messageText, sortMessages, sortParts, sortSessions } from "../message/mapping.js"

export function upsertMessage(messages: RaccoonMessage[], message: Message) {
  if (message.role !== "user" && message.role !== "assistant") return messages
  const existing = messages.find((item) => item.id === message.id)
  const mapped = mapMessageInfo(message)
  const next: RaccoonMessage = existing ? { ...existing, ...mapped, text: existing.text, parts: existing.parts } : mapped
  return sortMessages([...messages.filter((item) => item.id !== message.id), next])
}

export function upsertSession(
  sessions: RaccoonSession[],
  activeSessionID: string | undefined,
  activeSession: RaccoonSession | undefined,
  session: Session,
) {
  const next = mapSession(session)
  return {
    sessions: sortSessions([next, ...sessions.filter((item) => item.id !== session.id)]),
    activeSession: activeSessionID === next.id ? next : activeSession,
  }
}

export function removeSession(
  sessions: RaccoonSession[],
  activeSessionID: string | undefined,
  activeSession: RaccoonSession | undefined,
  messages: RaccoonMessage[],
  sessionID: string,
) {
  const nextSessions = sessions.filter((session) => session.id !== sessionID)
  return {
    sessions: nextSessions,
    activeSessionID: activeSessionID === sessionID ? nextSessions[0]?.id : activeSessionID,
    activeSession: activeSessionID === sessionID ? nextSessions[0] : nextSessions.find((session) => session.id === activeSessionID) ?? activeSession,
    messages: activeSessionID === sessionID ? [] : messages,
  }
}

export function upsertPart(messages: RaccoonMessage[], part: Part, pendingPartDeltas: Map<string, string>) {
  const found = messages.some((message) => message.id === part.messageID)
  if (!found) return messages
  const mapped = mapPart(part)
  if ((mapped.type === "text" || mapped.type === "reasoning") && pendingPartDeltas.has(part.id)) {
    mapped.text = `${mapped.text ?? ""}${pendingPartDeltas.get(part.id) ?? ""}`
    pendingPartDeltas.delete(part.id)
  }
  return messages.map((message) => {
    if (message.id !== part.messageID) return message
    const parts = sortParts([...(message.parts ?? []).filter((item) => item.id !== part.id), mapped])
    return {
      ...message,
      parts,
      text: messageText(parts),
    }
  })
}

export function removePart(messages: RaccoonMessage[], messageID: string, partID: string) {
  return messages.map((message) => {
    if (message.id !== messageID) return message
    return { ...message, parts: (message.parts ?? []).filter((part) => part.id !== partID) }
  })
}
