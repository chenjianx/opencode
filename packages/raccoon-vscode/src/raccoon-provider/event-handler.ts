import type { Event, GlobalEvent, Part, Message, Session } from "@opencode-ai/sdk/v2/client"
import type { RaccoonState } from "@opencode-ai/raccoon-webview"

function isEvent(payload: GlobalEvent["payload"]): payload is Event {
  return "properties" in payload
}

function isServerStreamEvent(payload: GlobalEvent["payload"]) {
  const type = (payload as { type: string }).type
  return type === "server.connected" || type === "server.heartbeat"
}

function eventSessionID(event: Event) {
  return event.type === "message.updated" ||
    event.type === "message.removed" ||
    event.type === "message.part.delta" ||
    event.type === "message.part.updated" ||
    event.type === "message.part.removed" ||
    event.type === "session.status" ||
    event.type === "session.idle" ||
    event.type === "session.error" ||
    event.type === "session.diff"
    ? event.properties.sessionID
    : undefined
}

type EventHandlerDeps = {
  directory: () => string
  getState: () => RaccoonState
  setState: (state: RaccoonState) => void
  post: () => void
  upsertSession: (session: Session) => void
  removeSession: (sessionID: string) => void
  upsertMessage: (message: Message) => void
  removeMessage: (messageID: string) => void
  hasMessage: (messageID: string) => boolean
  upsertPart: (part: Part) => void
  removePart: (messageID: string, partID: string) => void
  pushPartUpdate: (part: Part) => void
  pushPartDelta: (messageID: string, partID: string, field: string, delta: string) => void
  flushStreams: () => void
  stopPromptRefresh: (sessionID: string) => void
  clearPromptRefresh: (sessionID: string) => void
  scheduleEventRefresh: () => void
}

export class RaccoonEventHandler {
  constructor(private readonly deps: EventHandlerDeps) {}

  handleGlobal(event: GlobalEvent) {
    if (isServerStreamEvent(event.payload)) return
    if (event.directory && event.directory !== this.deps.directory() && event.directory !== "global") return
    if (!isEvent(event.payload)) return
    this.handle(event.payload)
  }

  private handle(event: Event) {
    if (event.type === "session.created") {
      this.deps.upsertSession(event.properties.info)
      this.deps.post()
      return
    }
    if (event.type === "session.updated") {
      this.deps.upsertSession(event.properties.info)
      this.deps.post()
      return
    }
    if (event.type === "session.deleted") {
      this.deps.removeSession(event.properties.info.id)
      this.deps.post()
      return
    }
    if (eventSessionID(event) !== this.deps.getState().activeSessionID) return
    if (event.type === "message.updated") {
      this.deps.stopPromptRefresh(event.properties.info.sessionID)
      this.deps.upsertMessage(event.properties.info)
      this.setBusy(true)
      return
    }
    if (event.type === "message.removed") {
      this.deps.removeMessage(event.properties.messageID)
      this.setBusy(true)
      return
    }
    if (event.type === "message.part.updated") {
      this.deps.stopPromptRefresh(event.properties.part.sessionID)
      const hasMessage = this.deps.hasMessage(event.properties.part.messageID)
      this.deps.upsertPart(event.properties.part)
      this.setState({ loading: true, busy: true })
      this.deps.pushPartUpdate(event.properties.part)
      if (!hasMessage) this.deps.scheduleEventRefresh()
      return
    }
    if (event.type === "message.part.delta") {
      this.deps.stopPromptRefresh(event.properties.sessionID)
      this.deps.pushPartDelta(event.properties.messageID, event.properties.partID, event.properties.field, event.properties.delta)
      this.setState({ loading: true, busy: true })
      return
    }
    if (event.type === "message.part.removed") {
      this.deps.stopPromptRefresh(event.properties.sessionID)
      this.deps.flushStreams()
      this.deps.removePart(event.properties.messageID, event.properties.partID)
      this.setBusy(true)
      return
    }
    if (event.type === "session.status") {
      const busy = event.properties.status.type !== "idle"
      if (busy) this.deps.stopPromptRefresh(event.properties.sessionID)
      if (!busy) this.deps.clearPromptRefresh(event.properties.sessionID)
      this.setBusy(busy)
      if (!busy) this.deps.scheduleEventRefresh()
      return
    }
    if (event.type === "session.idle") {
      this.deps.clearPromptRefresh(event.properties.sessionID)
      this.setBusy(false)
      this.deps.scheduleEventRefresh()
      return
    }
    this.setBusy(true)
  }

  private setBusy(busy: boolean) {
    this.setState({ loading: busy, busy })
    this.deps.post()
  }

  private setState(state: Partial<RaccoonState>) {
    this.deps.setState({ ...this.deps.getState(), ...state })
  }
}
