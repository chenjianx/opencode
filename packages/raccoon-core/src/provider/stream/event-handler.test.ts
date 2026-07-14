import { describe, expect, test } from "bun:test"
import type { ExtensionToWebview, RaccoonState } from "@opencode-ai/raccoon-webview"
import { RaccoonEventHandler } from "./event-handler"

function createHandler() {
  const messages: ExtensionToWebview[] = []
  const states: RaccoonState[] = []
  const handler = new RaccoonEventHandler({
    directory: () => "/workspace",
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
    pushPartUpdate: () => {},
    pushPartDelta: () => {},
    pushSubAgentPartDelta: () => {},
    upsertSubAgentMessage: () => {},
    flushStreams: () => {},
    stopPromptRefresh: () => {},
    clearPromptRefresh: () => {},
    scheduleEventRefresh: () => {},
    scheduleSubAgentRefresh: () => {},
    refreshMcpInstalled: () => {},
    postMessage: (message: ExtensionToWebview) => messages.push(message),
    onReauthRequired: () => {},
  } as never)
  return { handler, messages, states }
}

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

    expect(messages).toContainEqual({ type: "subAgentBusyChanged", busy: false })
  })
})
