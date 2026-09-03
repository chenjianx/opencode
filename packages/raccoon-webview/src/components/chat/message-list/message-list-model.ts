import type { RaccoonMessage, RaccoonMessagePart } from "../../../protocol"

export type Turn = {
  user?: RaccoonMessage
  assistant: RaccoonMessage[]
}

export function turns(messages: RaccoonMessage[]) {
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

export function visibleParts(message: RaccoonMessage) {
  return (message.parts ?? []).filter(
    (part) =>
      part.type !== "step-start" &&
      part.type !== "step-finish" &&
      part.type !== "patch" &&
      !part.synthetic &&
      ((part.type !== "text" && part.type !== "reasoning") || part.text?.trim()),
  )
}

type PartEntry = {
  messageID: string
  part: RaccoonMessagePart
}

type TurnPartGroup =
  | { type: "part"; entry: PartEntry }
  | { type: "tools"; entries: PartEntry[] }
  | { type: "boundary"; messageID: string }

type TurnPartItem = { type: "entry"; entry: PartEntry } | { type: "boundary"; messageID: string }

export function turnPartGroups(messages: RaccoonMessage[], boundaryMessageIDs: ReadonlySet<string> = new Set()) {
  const items = messages.flatMap<TurnPartItem>((message) => {
    const parts = visibleParts(message)
    const hasTextPart = (message.parts ?? []).some((part) => part.type === "text" && part.text?.trim())
    return [
      ...parts.map((part) => ({ type: "entry" as const, entry: { messageID: message.id, part } })),
      ...(!hasTextPart && message.text.trim()
        ? [
            {
              type: "entry" as const,
              entry: { messageID: message.id, part: { id: message.id, type: "text" as const, text: message.text } },
            },
          ]
        : []),
      ...(boundaryMessageIDs.has(message.id) ? [{ type: "boundary" as const, messageID: message.id }] : []),
    ]
  })

  return items.reduce<TurnPartGroup[]>((result, item) => {
    if (item.type === "boundary") {
      result.push(item)
      return result
    }
    if (item.entry.part.type !== "tool") {
      result.push({ type: "part", entry: item.entry })
      return result
    }
    const latest = result.at(-1)
    if (latest?.type === "tools") {
      latest.entries.push(item.entry)
      return result
    }
    result.push({ type: "tools", entries: [item.entry] })
    return result
  }, [])
}
