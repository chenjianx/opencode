import type { Event, GlobalEvent, Part, Message, Session } from "@opencode-ai/sdk/v2/client"
import type { ExtensionToWebview, RaccoonState } from "@opencode-ai/raccoon-webview"
import { win32 } from "node:path"

function sameDirectory(left: string, right: string) {
  if (left === right) return true
  const windows = (value: string) => /^[A-Za-z]:[\\/]/.test(value) || /^[\\/]{2}/.test(value)
  if (!windows(left) || !windows(right)) return false
  return win32.normalize(left).toLowerCase() === win32.normalize(right).toLowerCase()
}

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
    event.type === "session.diff" ||
    event.type === "question.asked" ||
    event.type === "question.replied" ||
    event.type === "question.rejected" ||
    event.type === "permission.asked" ||
    event.type === "permission.replied"
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
  pushPartDelta: (sessionID: string, messageID: string, partID: string, field: string, delta: string) => void
  pushSubAgentPartDelta: (sessionID: string, messageID: string, partID: string, field: string, delta: string) => void
  upsertSubAgentMessage: (message: Message) => void
  flushStreams: () => void
  stopPromptRefresh: (sessionID: string) => void
  clearPromptRefresh: (sessionID: string) => void
  scheduleEventRefresh: () => void
  scheduleSubAgentRefresh: (sessionID: string) => void
  isTrackedSubAgent: (sessionID: string) => boolean
  completeTrackedSubAgent: (sessionID: string) => void
  refreshMcpInstalled: () => void
  postMessage: (message: ExtensionToWebview) => void
  postSubAgentEvent: (sessionID: string, message: ExtensionToWebview) => void
  onReauthRequired: () => void
}

// Keep in sync with RACCOON_REAUTH_REQUIRED in @opencode-ai/raccoon-auth-plugin.
const RACCOON_REAUTH_REQUIRED = "RACCOON_REAUTH_REQUIRED"

export class RaccoonEventHandler {
  constructor(private readonly deps: EventHandlerDeps) {}

  handleGlobal(event: GlobalEvent) {
    if (isServerStreamEvent(event.payload)) return
    if (event.directory && event.directory !== "global" && !sameDirectory(event.directory, this.deps.directory())) return
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
    if (event.type === "mcp.tools.changed") {
      this.deps.refreshMcpInstalled()
      return
    }
    if (event.type === "session.error" && this.isReauthError(event.properties.error)) {
      this.deps.onReauthRequired()
    }
    const sessionID = eventSessionID(event)
    const isChildSession = sessionID && sessionID !== this.deps.getState().activeSessionID
    if (isChildSession) {
      if (!this.deps.isTrackedSubAgent(sessionID)) return
      if (event.type === "question.asked") {
        this.deps.postMessage({
          type: "questionRequest",
          question: {
            id: event.properties.id,
            sessionID: event.properties.sessionID,
            questions: event.properties.questions,
            tool: event.properties.tool,
          },
        })
        this.setState({ loading: true, busy: true })
        return
      }
      if (event.type === "question.replied" || event.type === "question.rejected") {
        this.deps.postMessage({ type: "questionResolved", requestID: event.properties.requestID })
        this.deps.scheduleSubAgentRefresh(sessionID)
        return
      }
      if (event.type === "permission.asked") {
        this.deps.postMessage({
          type: "permissionRequest",
          permission: {
            id: event.properties.id,
            sessionID: event.properties.sessionID,
            permission: event.properties.permission,
            patterns: event.properties.patterns,
            metadata: event.properties.metadata,
            always: event.properties.always,
            tool: event.properties.tool,
          },
        })
        this.setState({ loading: true, busy: true })
        return
      }
      if (event.type === "permission.replied") {
        this.deps.postMessage({ type: "permissionResolved", requestID: event.properties.requestID })
        this.deps.scheduleSubAgentRefresh(sessionID)
        return
      }
      if (event.type === "message.updated") {
        this.deps.upsertSubAgentMessage(event.properties.info)
        return
      }
      if (event.type === "message.part.updated") {
        this.deps.pushPartUpdate(event.properties.part)
        return
      }
      if (event.type === "message.part.delta") {
        this.deps.pushSubAgentPartDelta(sessionID, event.properties.messageID, event.properties.partID, event.properties.field, event.properties.delta)
        return
      }
      // session.status drives the busy indicator without a full refresh —
      // streaming events handle content, session.idle triggers final reconciliation.
      if (event.type === "session.status") {
        if (event.properties.status.type === "idle") this.deps.flushStreams()
        this.deps.postSubAgentEvent(sessionID, {
          type: "subAgentBusyChanged",
          sessionID,
          busy: event.properties.status.type !== "idle",
        })
        if (event.properties.status.type === "idle") this.deps.completeTrackedSubAgent(sessionID)
        return
      }
      if (event.type === "session.idle") {
        this.deps.flushStreams()
        this.deps.postSubAgentEvent(sessionID, { type: "subAgentBusyChanged", sessionID, busy: false })
        this.deps.completeTrackedSubAgent(sessionID)
        this.deps.scheduleSubAgentRefresh(sessionID)
        return
      }
      if (event.type === "session.error") {
        this.deps.flushStreams()
        this.deps.postSubAgentEvent(sessionID, { type: "subAgentBusyChanged", sessionID, busy: false })
        this.deps.completeTrackedSubAgent(sessionID)
        this.deps.scheduleSubAgentRefresh(sessionID)
        return
      }
      this.deps.scheduleSubAgentRefresh(sessionID)
      return
    }
    if (sessionID) this.deps.scheduleSubAgentRefresh(sessionID)
    if (sessionID !== this.deps.getState().activeSessionID) return
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
      this.setBusy(true)
      this.deps.pushPartUpdate(event.properties.part)
      if (!hasMessage) this.deps.scheduleEventRefresh()
      return
    }
    if (event.type === "message.part.delta") {
      this.deps.stopPromptRefresh(event.properties.sessionID)
      this.deps.pushPartDelta(event.properties.sessionID, event.properties.messageID, event.properties.partID, event.properties.field, event.properties.delta)
      this.setBusy(true)
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
    if (event.type === "session.error") {
      if (sessionID) this.deps.clearPromptRefresh(sessionID)
      this.setBusy(false)
      this.deps.scheduleEventRefresh()
      return
    }
    if (event.type === "question.asked") {
      this.deps.stopPromptRefresh(event.properties.sessionID)
      this.deps.postMessage({
        type: "questionRequest",
        question: {
          id: event.properties.id,
          sessionID: event.properties.sessionID,
          questions: event.properties.questions,
          tool: event.properties.tool,
        },
      })
      this.setState({ loading: true, busy: true })
      return
    }
    if (event.type === "question.replied" || event.type === "question.rejected") {
      this.deps.postMessage({ type: "questionResolved", requestID: event.properties.requestID })
      this.deps.scheduleEventRefresh()
      return
    }
    if (event.type === "permission.asked") {
      this.deps.stopPromptRefresh(event.properties.sessionID)
      this.deps.postMessage({
        type: "permissionRequest",
        permission: {
          id: event.properties.id,
          sessionID: event.properties.sessionID,
          permission: event.properties.permission,
          patterns: event.properties.patterns,
          metadata: event.properties.metadata,
          always: event.properties.always,
          tool: event.properties.tool,
        },
      })
      this.setState({ loading: true, busy: true })
      return
    }
    if (event.type === "permission.replied") {
      this.deps.postMessage({ type: "permissionResolved", requestID: event.properties.requestID })
      this.deps.scheduleEventRefresh()
      return
    }
    this.setBusy(true)
  }

  private setBusy(busy: boolean) {
    // Don't flip an idle session back to busy based on a background event
    // (e.g. compaction.prune part updates arriving after session.idle);
    // schedule a refresh to reconcile with the authoritative server status.
    if (busy && !this.deps.getState().busy) {
      this.deps.scheduleEventRefresh()
      return
    }
    this.setState({ loading: busy, busy })
    this.deps.post()
  }

  private setState(state: Partial<RaccoonState>) {
    this.deps.setState({ ...this.deps.getState(), ...state })
  }

  private isReauthError(error: unknown) {
    if (!error) return false
    try {
      return JSON.stringify(error).includes(RACCOON_REAUTH_REQUIRED)
    } catch {
      return false
    }
  }
}
