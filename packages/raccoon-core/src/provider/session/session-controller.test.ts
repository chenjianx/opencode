import { describe, expect, test } from "bun:test"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import type { ExtensionToWebview, RaccoonState } from "@opencode-ai/raccoon-webview"
import { RaccoonSessionController } from "./session-controller"

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void }
function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((r, fail) => {
    resolve = r
    reject = fail
  })
  return { promise, resolve, reject }
}

// Yield to the microtask/macrotask queue so pending loadMessages calls advance
// past their `await client()` and enqueue their session.messages request.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const refreshTick = () => new Promise((resolve) => setTimeout(resolve, 140))

function sessionInfo(id: string) {
  return { id, title: id, agent: "build", time: { updated: 1, created: 1 } }
}

function userMessage(sessionID: string, id: string, text: string, created = 1) {
  return {
    info: { id, sessionID, role: "user", time: { created } },
    parts: [{ id: `${id}-p`, sessionID, messageID: id, type: "text", text }],
  }
}

// Build a controller whose session.messages resolves through a queue of deferreds
// so tests can force stale/fresh response ordering. get/status/question resolve
// synchronously; only messages is deferred (Promise.all blocks on it).
function makeController(pendingPermissions: unknown[] = []) {
  const messagesQueue: { sessionID: string; before?: string; deferred: Deferred<{ data: unknown[]; response?: Response }> }[] = []
  const posts: ExtensionToWebview[] = []
  const client = {
    session: {
      get: async ({ sessionID }: { sessionID: string }) => ({ data: sessionInfo(sessionID) }),
      status: async () => ({ data: {} as Record<string, { type: string }> }),
      messages: ({ sessionID, before }: { sessionID: string; before?: string }) => {
        const deferred = defer<{ data: unknown[]; response?: Response }>()
        messagesQueue.push({ sessionID, before, deferred })
        return deferred.promise
      },
    },
    question: {
      list: async () => ({ data: [] as unknown[] }),
    },
    permission: {
      list: async () => ({ data: pendingPermissions }),
      reply: async () => ({ data: true }),
    },
  } as unknown as OpencodeClient

  let state: RaccoonState = { sessions: [], messages: [] } as unknown as RaccoonState
  const controller = new RaccoonSessionController({
    client: async () => client,
    directory: () => "/workspace",
    getState: () => state,
    setState: (next: RaccoonState) => {
      state = next
    },
    post: () => {},
    log: () => {},
    streams: { drop: () => {} },
    webviewHost: { post: (_source: string, message: ExtensionToWebview) => posts.push(message) },
    loadModels: async () => {},
  } as never)

  // Resolve the Nth session.messages call (0-indexed) with the given messages.
  const resolveMessages = (index: number, messages: unknown[], cursor?: string) => {
    messagesQueue[index].deferred.resolve({
      data: messages,
      response: new Response(null, { headers: cursor ? { "x-next-cursor": cursor } : undefined }),
    })
  }
  return { controller, resolveMessages, getState: () => state, messagesQueue, posts }
}

function makeSubAgentController(
  status: Record<string, { type: string }> = {},
  state = { sessions: [], messages: [] } as RaccoonState,
) {
  const messagesQueue: { sessionID: string; deferred: Deferred<{ data: unknown[] }> }[] = []
  const posts: ExtensionToWebview[] = []
  const client = {
    session: {
      status: async () => ({ data: status }),
      messages: ({ sessionID }: { sessionID: string }) => {
        const deferred = defer<{ data: unknown[] }>()
        messagesQueue.push({ sessionID, deferred })
        return deferred.promise
      },
    },
  } as unknown as OpencodeClient
  const controller = new RaccoonSessionController({
    client: async () => client,
    directory: () => "/workspace",
    getState: () => state,
    log: () => {},
    webviewHost: { post: (_source: string, message: ExtensionToWebview) => posts.push(message) },
  } as never)
  const resolveMessages = (index: number, sessionID: string, id: string, text: string) => {
    messagesQueue[index].deferred.resolve({ data: [userMessage(sessionID, id, text)] })
  }
  const rejectMessages = (index: number, error: unknown) => messagesQueue[index].deferred.reject(error)
  return { controller, messagesQueue, posts, rejectMessages, resolveMessages }
}

function makeSendController(sessionStatus: "idle" | "busy" = "idle") {
  const terminal = defer<string>()
  const prompts: { sessionID: string }[] = []
  let state = {
    activeSessionID: "A",
    sessions: [],
    messages: [{ id: "msg-a", role: "user", text: "A", parts: [], createdAt: 1 }],
    loading: false,
    busy: false,
  } as unknown as RaccoonState
  const client = {
    session: {
      status: async () => ({ data: sessionStatus === "idle" ? {} : { A: { type: sessionStatus } } }),
      promptAsync: async ({ sessionID }: { sessionID: string }) => {
        prompts.push({ sessionID })
      },
    },
  } as unknown as OpencodeClient
  const controller = new RaccoonSessionController({
    client: async () => client,
    directory: () => "/workspace",
    getState: () => state,
    setState: (next: RaccoonState) => {
      state = next
    },
    post: () => {},
    log: () => {},
    report: () => {},
    captureTerminal: () => terminal.promise,
    config: { modeModel: () => undefined },
  } as never)
  return {
    controller,
    terminal,
    prompts,
    getState: () => state,
    switchToB: () => {
      state = {
        ...state,
        activeSessionID: "B",
        messages: [{ id: "msg-b", role: "user", text: "B", parts: [], createdAt: 2 }],
      } as RaccoonState
    },
  }
}

describe("RaccoonSessionController loadMessages generation", () => {
  test("discards a stale load when a newer one supersedes it", async () => {
    const { controller, resolveMessages, getState } = makeController()

    // Start load A, then load B before either resolves.
    const loadA = controller.loadMessages("A")
    const loadB = controller.loadMessages("B")
    await tick() // let both calls reach their session.messages request

    // Newer load (B) resolves first and writes state.
    resolveMessages(1, [userMessage("B", "msg-b", "hello B")])
    await loadB
    expect(getState().activeSessionID).toBe("B")
    expect(getState().messages.map((m) => m.id)).toEqual(["msg-b"])

    // Stale load (A) resolves afterwards and must NOT overwrite B.
    resolveMessages(0, [userMessage("A", "msg-a", "hello A")])
    await loadA
    expect(getState().activeSessionID).toBe("B")
    expect(getState().messages.map((m) => m.id)).toEqual(["msg-b"])
  })

  test("same session: last invocation wins even if its response is later", async () => {
    const { controller, resolveMessages, getState } = makeController()

    const first = controller.loadMessages("A")
    const second = controller.loadMessages("A")
    await tick() // let both calls reach their session.messages request

    // Second (newest) resolves first with fresh data.
    resolveMessages(1, [userMessage("A", "msg-new", "fresh")])
    await second
    expect(getState().messages.map((m) => m.id)).toEqual(["msg-new"])

    // First (stale) resolves later with old data — must be discarded.
    resolveMessages(0, [userMessage("A", "msg-old", "stale")])
    await first
    expect(getState().messages.map((m) => m.id)).toEqual(["msg-new"])
  })

  test("permission reply for child session refreshes active parent session", async () => {
    const { controller, resolveMessages, messagesQueue } = makeController()

    const loadRoot = controller.loadMessages("root")
    await tick()
    resolveMessages(0, [userMessage("root", "msg-root", "hello root")])
    await loadRoot

    const reply = controller.permissionReply({ type: "permissionReply", requestID: "perm-child", sessionID: "child", reply: "once" })
    await tick()
    expect(messagesQueue[1]?.sessionID).toBe("root")

    resolveMessages(1, [userMessage("root", "msg-root-2", "still root")])
    await reply
  })

  test("recovers a pending permission when refreshing the active session", async () => {
    const { controller, resolveMessages, posts } = makeController([
      {
        id: "perm-a",
        sessionID: "A",
        permission: "external_directory",
        patterns: ["C:\\ProgramData\\MySQL\\*"],
        metadata: {},
        always: ["C:\\ProgramData\\MySQL\\*"],
      },
      {
        id: "perm-b",
        sessionID: "B",
        permission: "bash",
        patterns: ["echo B"],
        metadata: {},
        always: ["echo B"],
      },
    ])

    const load = controller.loadMessages("A")
    await tick()
    resolveMessages(0, [userMessage("A", "msg-a", "hello A")])
    await load

    expect(posts).toEqual([
      {
        type: "permissionRequest",
        permission: {
          id: "perm-a",
          sessionID: "A",
          permission: "external_directory",
          patterns: ["C:\\ProgramData\\MySQL\\*"],
          metadata: {},
          always: ["C:\\ProgramData\\MySQL\\*"],
          tool: undefined,
        },
      },
    ])
  })

  test("loads older messages with the cursor and preserves them across refreshes", async () => {
    const { controller, resolveMessages, getState, messagesQueue } = makeController()

    const initial = controller.loadMessages("A")
    await tick()
    resolveMessages(0, [userMessage("A", "msg-new", "new", 2)], "older-page")
    await initial
    expect(getState().messageCursor).toBe("older-page")

    const older = controller.loadOlderMessages("A")
    await tick()
    expect(messagesQueue[1]?.before).toBe("older-page")
    resolveMessages(1, [userMessage("A", "msg-old", "old", 1)])
    await older
    expect(getState().messages.map((message) => message.id)).toEqual(["msg-old", "msg-new"])
    expect(getState().messagesComplete).toBe(true)

    const refresh = controller.loadMessages("A")
    await tick()
    resolveMessages(2, [userMessage("A", "msg-new", "newer", 2)])
    await refresh
    expect(getState().messages.map((message) => message.id)).toEqual(["msg-old", "msg-new"])
    expect(getState().messages.find((message) => message.id === "msg-new")?.text).toBe("newer")
  })

  test("finishes an older page when the latest page refreshes concurrently", async () => {
    const { controller, resolveMessages, getState } = makeController()

    const initial = controller.loadMessages("A")
    await tick()
    resolveMessages(0, [userMessage("A", "msg-new", "new", 2)], "older-page")
    await initial

    const older = controller.loadOlderMessages("A")
    await tick()
    const refresh = controller.loadMessages("A")
    await tick()
    resolveMessages(2, [userMessage("A", "msg-newer", "newer", 3)], "refreshed-page")
    await refresh
    expect(getState().messagesLoadingOlder).toBe(true)

    resolveMessages(1, [userMessage("A", "msg-old", "old", 1)])
    await older
    expect(getState().messagesLoadingOlder).toBe(false)
    expect(getState().messages.map((message) => message.id)).toEqual(["msg-old", "msg-new", "msg-newer"])
  })
})

describe("RaccoonSessionController subagent navigation", () => {
  test("tracks only descendants of the active session", () => {
    const { controller } = makeSubAgentController({}, {
      activeSessionID: "root-a",
      sessions: [
        { id: "root-a", title: "A", updatedAt: 1 },
        { id: "child-a", title: "child A", parentID: "root-a", updatedAt: 1 },
        { id: "root-b", title: "B", updatedAt: 1 },
      ],
      messages: [],
    } as RaccoonState)

    expect(controller.isTrackedSubAgent("child-a")).toBeTrue()
    expect(controller.isTrackedSubAgent("root-b")).toBeFalse()
  })

  test("initializes the open subagent busy state from session status", async () => {
    const { controller, posts, resolveMessages } = makeSubAgentController({ A: { type: "busy" } })

    const open = controller.openSubAgent("A", "A")
    await tick()
    resolveMessages(0, "A", "msg-a", "A")
    await open

    expect(posts.at(-1)).toMatchObject({
      type: "showSubAgent",
      view: { sessionID: "A", loading: false, busy: true },
    })
  })

  test("replays stream updates after the snapshot that was loading", async () => {
    const { controller, posts, resolveMessages } = makeSubAgentController()

    const open = controller.openSubAgent("A", "A")
    await tick()
    controller.postSubAgentEvent("A", {
      type: "partUpdated",
      sessionID: "A",
      messageID: "msg-a",
      part: { id: "msg-a-p", type: "text", text: "live" },
    })
    resolveMessages(0, "A", "msg-a", "")
    await open

    expect(posts.slice(-2)).toEqual([
      {
        type: "showSubAgent",
        view: {
          sessionID: "A",
          title: "A",
          messages: [
            {
              id: "msg-a",
              role: "user",
              text: "",
              parts: [{ id: "msg-a-p", type: "text", text: "" }],
              createdAt: 1,
            },
          ],
          loading: false,
          busy: false,
        },
      },
      {
        type: "partUpdated",
        sessionID: "A",
        messageID: "msg-a",
        part: { id: "msg-a-p", type: "text", text: "live" },
      },
    ])
  })

  test("replays tracked stream updates that arrived before the subagent opened", async () => {
    const { controller, posts, resolveMessages } = makeSubAgentController()

    controller.postSubAgentEvent("A", {
      type: "partUpdated",
      sessionID: "A",
      messageID: "msg-a",
      part: { id: "msg-a-p", type: "text", text: "already live" },
    })
    const open = controller.openSubAgent("A", "A")
    await tick()
    resolveMessages(0, "A", "msg-a", "")
    await open

    expect(posts.at(-1)).toEqual({
      type: "partUpdated",
      sessionID: "A",
      messageID: "msg-a",
      part: { id: "msg-a-p", type: "text", text: "already live" },
    })
  })

  test("keeps unpersisted stream updates when reopening a subagent with an absent status", async () => {
    const { controller, posts, resolveMessages } = makeSubAgentController()

    controller.postSubAgentEvent("A", {
      type: "partUpdated",
      sessionID: "A",
      messageID: "msg-a",
      part: { id: "msg-a-p", type: "text", text: "live" },
      delta: { type: "text-delta", textDelta: "live" },
    })
    const first = controller.openSubAgent("A", "A")
    await tick()
    resolveMessages(0, "A", "msg-a", "")
    await first
    controller.closeSubAgent()

    const reopenedAt = posts.length
    const reopened = controller.openSubAgent("A", "A")
    await tick()
    resolveMessages(1, "A", "msg-a", "")
    await reopened

    expect(posts.slice(reopenedAt).at(-1)).toEqual({
      type: "partUpdated",
      sessionID: "A",
      messageID: "msg-a",
      part: { id: "msg-a-p", type: "text", text: "live" },
      delta: { type: "text-delta", textDelta: "live" },
    })
  })

  test("replays buffered events and permits retry after a refresh failure", async () => {
    const { controller, messagesQueue, posts, rejectMessages, resolveMessages } = makeSubAgentController()

    const open = controller.openSubAgent("A", "A")
    await tick()
    resolveMessages(0, "A", "msg-a", "A")
    await open

    controller.scheduleSubAgentRefresh("A")
    await refreshTick()
    controller.postSubAgentEvent("A", { type: "subAgentBusyChanged", sessionID: "A", busy: true })
    rejectMessages(1, new Error("refresh failed"))
    await tick()

    expect(posts.at(-1)).toEqual({ type: "subAgentBusyChanged", sessionID: "A", busy: true })

    controller.scheduleSubAgentRefresh("A")
    await refreshTick()
    expect(messagesQueue.map((item) => item.sessionID)).toEqual(["A", "A", "A"])
    resolveMessages(2, "A", "msg-a", "A")
  })

  test("discards an earlier request after reopening the same subagent", async () => {
    const { controller, messagesQueue, posts, resolveMessages } = makeSubAgentController()

    const firstA = controller.openSubAgent("A", "first A")
    await tick()
    const openB = controller.openSubAgent("B", "B")
    await tick()
    const secondA = controller.openSubAgent("A", "second A")
    await tick()

    expect(messagesQueue.map((item) => item.sessionID)).toEqual(["A", "B", "A"])
    resolveMessages(2, "A", "msg-new-a", "new A")
    await secondA
    resolveMessages(0, "A", "msg-old-a", "old A")
    await firstA
    resolveMessages(1, "B", "msg-b", "B")
    await openB

    expect(
      posts
        .filter((message) => message.type === "showSubAgent" && !message.view.loading)
        .map((message) => (message.type === "showSubAgent" ? message.view.messages.map((item) => item.id) : [])),
    ).toEqual([["msg-new-a"]])
  })

  test("reschedules a pending refresh for the newly opened subagent", async () => {
    const { controller, messagesQueue, resolveMessages } = makeSubAgentController()

    const openA = controller.openSubAgent("A", "A")
    await tick()
    resolveMessages(0, "A", "msg-a", "A")
    await openA

    controller.scheduleSubAgentRefresh("A")
    await refreshTick()
    const openB = controller.openSubAgent("B", "B")
    await tick()
    controller.scheduleSubAgentRefresh("B")
    await refreshTick()
    resolveMessages(1, "A", "msg-refresh-a", "refresh A")
    await tick()
    await refreshTick()
    resolveMessages(2, "B", "msg-b", "B")
    await openB
    await refreshTick()
    if (messagesQueue[3]) {
      resolveMessages(3, "B", "msg-refresh-b", "refresh B")
      await tick()
    }

    expect(messagesQueue.map((item) => item.sessionID)).toEqual(["A", "A", "B", "B"])
  })
})

describe("RaccoonSessionController context inspector", () => {
  test("posts a source-scoped snapshot without changing state", async () => {
    const posts: Array<{ source: string; message: ExtensionToWebview }> = []
    const state = { sessions: [], messages: [] } as unknown as RaccoonState
    const client = {
      session: {
        get: async () => ({ data: sessionInfo("A") }),
        messages: async () => ({ data: [userMessage("A", "msg-a", "hello")] }),
      },
    } as unknown as OpencodeClient
    const controller = new RaccoonSessionController({
      client: async () => client,
      directory: () => "/workspace",
      getState: () => state,
      setState: () => {
        throw new Error("context inspector must not update state")
      },
      log: () => {},
      webviewHost: {
        post: (source: string, message: ExtensionToWebview) => posts.push({ source, message }),
      },
    } as never)

    await controller.requestContextInspector(
      { type: "requestContextInspector", requestID: "request-1", sessionID: "A" },
      "settings",
    )

    expect(posts).toHaveLength(1)
    expect(posts[0].source).toBe("settings")
    expect(posts[0].message.type).toBe("contextInspectorResult")
    if (posts[0].message.type !== "contextInspectorResult") throw new Error("unexpected message")
    expect(posts[0].message.requestID).toBe("request-1")
    expect(posts[0].message.sessionID).toBe("A")
    expect(posts[0].message.snapshot?.messages[0].id).toBe("msg-a")
  })

  test("returns request-scoped errors", async () => {
    const posts: ExtensionToWebview[] = []
    const client = {
      session: {
        get: async () => {
          throw new Error("not found")
        },
        messages: async () => ({ data: [] }),
      },
    } as unknown as OpencodeClient
    const controller = new RaccoonSessionController({
      client: async () => client,
      directory: () => "/workspace",
      getState: () => ({ sessions: [], messages: [] }),
      log: () => {},
      webviewHost: { post: (_source: string, message: ExtensionToWebview) => posts.push(message) },
    } as never)

    await controller.requestContextInspector(
      { type: "requestContextInspector", requestID: "request-error", sessionID: "missing" },
      "chat",
    )

    expect(posts).toEqual([
      {
        type: "contextInspectorResult",
        requestID: "request-error",
        sessionID: "missing",
        error: "not found",
      },
    ])
  })
})

describe("RaccoonSessionController history", () => {
  test("searches titles and appends cursor pages without child sessions", async () => {
    const requests: Array<{ limit?: number; cursor?: string; order?: string }> = []
    const sessions = [
      ...Array.from({ length: 51 }, (_, index) => ({
        id: `root-${index}`,
        title: `Needle ${index}`,
        time: { created: 51 - index, updated: 100 - index },
      })),
      { id: "child", parentID: "root-0", title: "Needle child", time: { created: 52, updated: 101 } },
      { id: "other", title: "Other", time: { created: 53, updated: 102 } },
      ...Array.from({ length: 4_947 }, (_, index) => ({
        id: `child-extra-${index}`,
        parentID: "root-0",
        title: `Child extra ${index}`,
        time: { created: 54 + index, updated: 54 + index },
      })),
    ]
    let state = { sessions: [], messages: [] } as unknown as RaccoonState
    const client = {
      v2: {
        session: {
          list: async (input: { limit?: number; cursor?: string; order?: string }) => {
            requests.push(input)
            return {
              data: requests.length === 1 ? { data: sessions, cursor: { next: "next-page" } } : { data: [], cursor: {} },
            }
          },
        },
      },
    } as unknown as OpencodeClient
    const controller = new RaccoonSessionController({
      client: async () => client,
      directory: () => "/workspace",
      getState: () => state,
      setState: (next: RaccoonState) => {
        state = next
      },
      post: () => {},
      report: () => {},
    } as never)

    await controller.loadHistory(" needle ", true)
    expect(requests).toEqual([
      { directory: "/workspace", limit: 5_000, order: "desc" },
      { directory: "/workspace", limit: 5_000, cursor: "next-page" },
    ])
    expect(state.historySessions).toHaveLength(50)
    expect(state.historySessions?.[0]?.id).toBe("root-0")
    expect(state.historyCursor).toBe("50")

    await controller.loadMoreHistory()
    expect(requests).toHaveLength(2)
    expect(state.historySessions).toHaveLength(51)
    expect(state.historySessions?.at(-1)?.id).toBe("root-50")
    expect(state.historyComplete).toBe(true)
  })
})

describe("RaccoonSessionController sendMessage session isolation", () => {
  test("sends to the original session without mutating the newly active session", async () => {
    const { controller, terminal, prompts, getState, switchToB } = makeSendController()

    const send = controller.sendMessage("A", "check @terminal", "build")
    await tick()
    switchToB()
    terminal.resolve("terminal output")
    await send

    expect(prompts).toEqual([{ sessionID: "A" }])
    expect(getState().activeSessionID).toBe("B")
    expect(getState().messages.map((message) => message.id)).toEqual(["msg-b"])
    expect(getState().loading).toBe(false)
    expect(getState().busy).toBe(false)
  })

  test("does not mark the active session busy when the target session is busy", async () => {
    const { controller, prompts, getState, switchToB } = makeSendController("busy")
    switchToB()

    await controller.sendMessage("A", "hello", "build")

    expect(prompts).toEqual([])
    expect(getState().activeSessionID).toBe("B")
    expect(getState().messages.map((message) => message.id)).toEqual(["msg-b"])
    expect(getState().loading).toBe(false)
    expect(getState().busy).toBe(false)
  })
})
