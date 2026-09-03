import { describe, expect, test } from "bun:test"
import type { ExtensionToWebview, RaccoonState } from "@opencode-ai/raccoon-webview"
import { RaccoonEventHandler } from "./event-handler"

function createHandler(trackedSubAgentSessionID = "child", directory = "/workspace") {
  const messages: ExtensionToWebview[] = []
  const routedSubAgentSessions: string[] = []
  const states: RaccoonState[] = []
  const handler = new RaccoonEventHandler({
    directory: () => directory,
    getState: () => ({ activeSessionID: "root" }) as RaccoonState,
    setState: (state: RaccoonState) => states.push(state),
    post: () => {},
    upsertSession: () => {},
    removeSession: () => {},
    upsertMessage: () => {},
    removeMessage: () => {},
    hasMessage: () => false,
    upsertPart: () => {},
    removePart: () => {},
    pushPartUpdate: (part) => routedSubAgentSessions.push(part.sessionID),
    pushPartDelta: () => {},
    pushSubAgentPartDelta: () => {},
    upsertSubAgentMessage: (message) => routedSubAgentSessions.push(message.sessionID),
    flushStreams: () => {},
    stopPromptRefresh: () => {},
    clearPromptRefresh: () => {},
    scheduleEventRefresh: () => {},
    scheduleSubAgentRefresh: () => {},
    isTrackedSubAgent: (sessionID: string) => sessionID === trackedSubAgentSessionID,
    completeTrackedSubAgent: () => {},
    refreshMcpInstalled: () => {},
    postMessage: (message: ExtensionToWebview) => messages.push(message),
    postSubAgentEvent: (_sessionID: string, message: ExtensionToWebview) => messages.push(message),
    onReauthRequired: () => {},
  } as never)
  return { handler, messages, routedSubAgentSessions, states }
}

describe("RaccoonEventHandler child session streaming", () => {
  test("ignores questions from a session outside the active session tree", () => {
    const { handler, messages, states } = createHandler("child-a")

    handler.handleGlobal({
      type: "event",
      directory: "/workspace",
      payload: {
        type: "question.asked",
        properties: {
          id: "question-b",
          sessionID: "child-b",
          questions: [],
        },
      },
    } as never)

    expect(messages).toEqual([])
    expect(states).toEqual([])
  })

  test("ignores message and part updates outside the active session tree", () => {
    const { handler, routedSubAgentSessions } = createHandler("child-a")

    handler.handleGlobal({
      type: "event",
      directory: "/workspace",
      payload: {
        type: "message.updated",
        properties: {
          sessionID: "child-b",
          info: {
            id: "msg-child-b",
            sessionID: "child-b",
            role: "assistant",
            time: { created: 1 },
            tokens: {},
            cost: 0,
          },
        },
      },
    } as never)
    handler.handleGlobal({
      type: "event",
      directory: "/workspace",
      payload: {
        type: "message.part.updated",
        properties: {
          sessionID: "child-b",
          part: {
            id: "prt-child-b",
            sessionID: "child-b",
            messageID: "msg-child-b",
            type: "text",
            text: "from child b",
          },
        },
      },
    } as never)

    expect(routedSubAgentSessions).toEqual([])
  })

  test("ignores busy changes outside the active session tree", () => {
    const { handler, messages } = createHandler("child-a")

    handler.handleGlobal({
      type: "event",
      directory: "/workspace",
      payload: {
        type: "session.status",
        properties: {
          sessionID: "child-b",
          status: { type: "busy" },
        },
      },
    } as never)

    expect(messages).toEqual([])
  })

  test("identifies the session for tracked subagent busy changes", () => {
    const { handler, messages } = createHandler("child-a")

    handler.handleGlobal({
      type: "event",
      directory: "/workspace",
      payload: {
        type: "session.status",
        properties: {
          sessionID: "child-a",
          status: { type: "busy" },
        },
      },
    } as never)

    expect(messages).toEqual([{ type: "subAgentBusyChanged", sessionID: "child-a", busy: true }])
  })
})

describe("RaccoonEventHandler child session permissions", () => {
  test("forwards child permission requests to the webview", () => {
    const { handler, messages, states } = createHandler()

    handler.handleGlobal({
      type: "event",
      directory: "/workspace",
      payload: {
        type: "permission.asked",
        properties: {
          id: "perm-child",
          sessionID: "child",
          permission: "external_directory",
          patterns: ["/tmp/*"],
          metadata: {},
          always: ["/tmp/*"],
        },
      },
    } as never)

    expect(messages).toEqual([
      {
        type: "permissionRequest",
        permission: {
          id: "perm-child",
          sessionID: "child",
          permission: "external_directory",
          patterns: ["/tmp/*"],
          metadata: {},
          always: ["/tmp/*"],
          tool: undefined,
        },
      },
    ])
    expect(states.at(-1)).toMatchObject({ loading: true, busy: true })
  })
})

describe("RaccoonEventHandler Windows directory routing", () => {
  test("forwards events when only Windows path casing differs", () => {
    const { handler, messages } = createHandler("child", "d:\\Desktop")

    handler.handleGlobal({
      type: "event",
      directory: "D:\\Desktop",
      payload: {
        type: "permission.asked",
        properties: {
          id: "perm-root",
          sessionID: "root",
          permission: "external_directory",
          patterns: ["C:\\ProgramData\\MySQL\\*"],
          metadata: {},
          always: ["C:\\ProgramData\\MySQL\\*"],
        },
      },
    } as never)

    expect(messages).toEqual([
      {
        type: "permissionRequest",
        permission: {
          id: "perm-root",
          sessionID: "root",
          permission: "external_directory",
          patterns: ["C:\\ProgramData\\MySQL\\*"],
          metadata: {},
          always: ["C:\\ProgramData\\MySQL\\*"],
          tool: undefined,
        },
      },
    ])
  })
})

describe("RaccoonEventHandler session.error", () => {
  test("clears busy state for active session", () => {
    const { handler, states } = createHandler()

    handler.handleGlobal({
      type: "event",
      directory: "/workspace",
      payload: {
        type: "session.error",
        properties: {
          sessionID: "root",
          error: { message: "something went wrong" },
        },
      },
    } as never)

    expect(states.at(-1)).toMatchObject({ loading: false, busy: false })
  })

  test("clears subagent busy for child session error", () => {
    const { handler, messages } = createHandler()

    handler.handleGlobal({
      type: "event",
      directory: "/workspace",
      payload: {
        type: "session.error",
        properties: {
          sessionID: "child",
          error: { message: "child failed" },
        },
      },
    } as never)

    expect(messages).toContainEqual({ type: "subAgentBusyChanged", sessionID: "child", busy: false })
  })
})
