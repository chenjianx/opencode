import { describe, expect, test } from "bun:test"
import type { RaccoonMessage, RaccoonMessagePart } from "../protocol"
import { applyPartUpdates } from "./session-parts"

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
        messageID: "msg_1",
        part: { id: "prt_1", type: "text", text: "" },
        delta: { type: "text-delta", textDelta: "world" },
      },
    ])

    expect(result[0]?.parts[0]?.text).toBe("hello world")
    expect(result[0]?.text).toBe("hello world")
  })

  test("creates a minimal text part for early deltas", () => {
    const result = applyPartUpdates([message()], [
      {
        messageID: "msg_1",
        part: { id: "prt_1", type: "text", text: "" },
        delta: { type: "text-delta", textDelta: "hello" },
      },
    ])

    expect(result[0]?.parts).toEqual([{ id: "prt_1", type: "text", text: "hello" }])
    expect(result[0]?.text).toBe("hello")
  })
})
