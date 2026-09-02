import { describe, expect, test } from "bun:test"
import type { RaccoonMessage, RaccoonMessagePart } from "../protocol"
import { applyPartUpdates, mergeSubAgentView } from "./session-parts"

const message = (parts: RaccoonMessagePart[] = []): RaccoonMessage => ({
  id: "msg_1",
  role: "assistant",
  text: "",
  parts,
  createdAt: 1,
})

describe("applyPartUpdates", () => {
  test("appends text deltas to existing parts", () => {
    const result = applyPartUpdates([message([{ id: "prt_1", type: "text", text: "hello " }])], [
      {
        sessionID: "root",
        messageID: "msg_1",
        part: { id: "prt_1", type: "text", text: "" },
        delta: { type: "text-delta", textDelta: "world" },
      },
    ], "root")

    expect(result[0]?.parts[0]?.text).toBe("hello world")
    expect(result[0]?.text).toBe("hello world")
  })

  test("creates a minimal text part for early deltas", () => {
    const result = applyPartUpdates([message()], [
      {
        sessionID: "root",
        messageID: "msg_1",
        part: { id: "prt_1", type: "text", text: "" },
        delta: { type: "text-delta", textDelta: "hello" },
      },
    ], "root")

    expect(result[0]?.parts).toEqual([{ id: "prt_1", type: "text", text: "hello" }])
    expect(result[0]?.text).toBe("hello")
  })

  test("ignores updates from a different session", () => {
    const result = applyPartUpdates(
      [message([{ id: "prt_1", type: "text", text: "child a" }])],
      [
        {
          sessionID: "child-b",
          messageID: "msg_1",
          part: { id: "prt_1", type: "text", text: "child b" },
        },
      ],
      "child-a",
    )

    expect(result[0]?.parts[0]?.text).toBe("child a")
  })
})

describe("mergeSubAgentView", () => {
  test("uses the busy state from a completed snapshot", () => {
    expect(
      mergeSubAgentView(
        { sessionID: "child", messages: [], loading: true },
        { sessionID: "child", messages: [], loading: false, busy: true },
      ).busy,
    ).toBeTrue()
  })

  test("preserves busy when a same-session refresh omits it", () => {
    expect(
      mergeSubAgentView(
        { sessionID: "child", messages: [], busy: true },
        { sessionID: "child", messages: [], loading: false },
      ).busy,
    ).toBeTrue()
  })
})
