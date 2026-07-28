import { describe, expect, test } from "bun:test"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { contextInspectorSnapshot } from "./context-inspector"
import type { SessionMessageWithParts } from "./mapping"

const session = {
  id: "session-1",
  title: "Inspector",
  cost: 1.25,
  time: { created: 1, updated: 10 },
  revert: { messageID: "user-3" },
} as unknown as Session

const messages = [
  {
    info: { id: "user-1", sessionID: session.id, role: "user", time: { created: 2 }, system: "old" },
    parts: [{ id: "part-user-1", type: "text", text: "12345678" }],
  },
  {
    info: { id: "assistant-1", sessionID: session.id, role: "assistant", time: { created: 3 }, providerID: "old", modelID: "old", tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } },
    parts: [],
  },
  {
    info: { id: "user-2", sessionID: session.id, role: "user", time: { created: 4 }, system: " latest system " },
    parts: [{ id: "part-user-2", type: "text", text: "1234" }],
  },
  {
    info: { id: "assistant-2", sessionID: session.id, role: "assistant", time: { created: 5 }, providerID: "provider", modelID: "model", tokens: { input: 20, output: 2, reasoning: 1, cache: { read: 3, write: 4 } } },
    parts: [
      { id: "part-assistant", type: "text", text: "12345678" },
      { id: "part-tool", type: "tool", tool: "read", state: { status: "completed", input: { path: "x" }, output: "1234" } },
    ],
  },
  {
    info: { id: "user-3", sessionID: session.id, role: "user", time: { created: 6 }, system: "reverted" },
    parts: [],
  },
] as unknown as SessionMessageWithParts[]

describe("contextInspectorSnapshot", () => {
  test("builds the desktop-compatible projected context view", () => {
    const snapshot = contextInspectorSnapshot(session, messages, true)

    expect(snapshot.session).toEqual({
      id: "session-1",
      title: "Inspector",
      createdAt: 1,
      updatedAt: 10,
      cost: 1.25,
    })
    expect(snapshot.model).toEqual({ providerID: "provider", modelID: "model" })
    expect(snapshot.systemPrompt).toBe("latest system")
    expect(snapshot.usage?.input).toBe(20)
    expect(snapshot.breakdown).toEqual([
      { key: "system", tokens: 4, percent: 20 },
      { key: "user", tokens: 3, percent: 15 },
      { key: "assistant", tokens: 2, percent: 10 },
      { key: "tool", tokens: 5, percent: 25 },
      { key: "other", tokens: 6, percent: 30 },
    ])
    expect(snapshot.messages).toHaveLength(5)
    expect(JSON.parse(snapshot.messages[0].raw)).toEqual({
      message: messages[0].info,
      parts: messages[0].parts,
    })
    expect(snapshot.truncated).toBeTrue()
  })

  test("returns no breakdown without assistant input usage", () => {
    const snapshot = contextInspectorSnapshot(session, messages.slice(0, 2), false)

    expect(snapshot.model).toBeUndefined()
    expect(snapshot.breakdown).toEqual([])
    expect(snapshot.truncated).toBeFalse()
  })
})
