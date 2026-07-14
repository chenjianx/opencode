import type { RaccoonMessage } from "../../../protocol"

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
      !part.synthetic &&
      ((part.type !== "text" && part.type !== "reasoning") || part.text?.trim()),
  )
}
