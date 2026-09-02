import type { ExtensionToWebview, RaccoonPartUpdate } from "@opencode-ai/raccoon-webview"

const   FLUSH_MS = 16

function key(update: RaccoonPartUpdate) {
  return `${update.sessionID}:${update.messageID}:${update.part.id}`
}

function appendText(part: RaccoonPartUpdate["part"], text: string) {
  if (part.type !== "text" && part.type !== "reasoning") return part
  return { ...part, text: `${part.text ?? ""}${text}` }
}

function mergeUpdate(previous: RaccoonPartUpdate | undefined, next: RaccoonPartUpdate): RaccoonPartUpdate {
  if (!previous) {
    return next.delta ? { ...next, part: appendText(next.part, next.delta.textDelta) } : next
  }
  if (!next.delta) return next
  if (!previous.delta) {
    return { ...previous, part: appendText(previous.part, next.delta.textDelta) }
  }
  return {
    ...previous,
    part: appendText(previous.part, next.delta.textDelta),
    delta: {
      type: "text-delta",
      textDelta: `${previous.delta.textDelta}${next.delta.textDelta}`,
    },
  }
}

export class RaccoonStreamScheduler {
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly queue = new Map<string, RaccoonPartUpdate>()

  constructor(private readonly send: (message: ExtensionToWebview) => void) {}

  push(update: RaccoonPartUpdate) {
    const itemKey = key(update)
    const previous = this.queue.get(itemKey)
    if (previous?.delta && !update.delta) this.flush()
    this.queue.set(itemKey, mergeUpdate(this.queue.get(itemKey), update))
    this.schedule()
  }

  flush() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    if (this.queue.size === 0) return
    const updates = [...this.queue.values()]
    this.queue.clear()
    if (updates.length === 1) {
      const update = updates[0]
      if (!update) return
      this.send({
        type: "partUpdated",
        sessionID: update.sessionID,
        messageID: update.messageID,
        part: update.part,
        ...(update.delta ? { delta: update.delta } : {}),
      })
      return
    }
    this.send({ type: "partsUpdated", updates })
  }

  drop() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    this.queue.clear()
  }

  dispose() {
    this.drop()
  }

  private schedule() {
    if (this.timer) return
    this.timer = setTimeout(() => this.flush(), FLUSH_MS)
  }
}
