import { describe, expect, test } from "bun:test"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import type { RaccoonState } from "@opencode-ai/raccoon-webview"
import { RaccoonSessionController } from "./session-controller"

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }
function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// Yield to the microtask/macrotask queue so pending loadMessages calls advance
// past their `await client()` and enqueue their session.messages request.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function sessionInfo(id: string) {
  return { id, title: id, agent: "build", time: { updated: 1, created: 1 } }
}

function userMessage(sessionID: string, id: string, text: string) {
  return {
    info: { id, sessionID, role: "user", time: { created: 1 } },
    parts: [{ id: `${id}-p`, sessionID, messageID: id, type: "text", text }],
  }
}

// Build a controller whose session.messages resolves through a queue of deferreds
// so tests can force stale/fresh response ordering. get/status/question resolve
// synchronously; only messages is deferred (Promise.all blocks on it).
function makeController() {
  const messagesQueue: { sessionID: string; deferred: Deferred<{ data: unknown[] }> }[] = []
  const client = {
    session: {
      get: async ({ sessionID }: { sessionID: string }) => ({ data: sessionInfo(sessionID) }),
      status: async () => ({ data: {} as Record<string, { type: string }> }),
      messages: ({ sessionID }: { sessionID: string }) => {
        const deferred = defer<{ data: unknown[] }>()
        messagesQueue.push({ sessionID, deferred })
        return deferred.promise
      },
    },
    question: {
      list: async () => ({ data: [] as unknown[] }),
    },
    permission: {
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
    webviewHost: { post: () => {} },
    loadModels: async () => {},
  } as never)

  // Resolve the Nth session.messages call (0-indexed) with the given messages.
  const resolveMessages = (index: number, messages: unknown[]) => {
    messagesQueue[index].deferred.resolve({ data: messages })
  }
  return { controller, resolveMessages, getState: () => state, messagesQueue }
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
})
