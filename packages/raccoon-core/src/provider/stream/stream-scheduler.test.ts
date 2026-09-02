import { describe, expect, test } from "bun:test"
import type { ExtensionToWebview, RaccoonMessagePart } from "@opencode-ai/raccoon-webview"
import { RaccoonStreamScheduler } from "./stream-scheduler"

const textPart = (id: string, text = ""): RaccoonMessagePart => ({
  id,
  type: "text",
  text,
})

describe("RaccoonStreamScheduler", () => {
  test("merges text deltas for the same part", () => {
    const sent: ExtensionToWebview[] = []
    const scheduler = new RaccoonStreamScheduler((message) => sent.push(message))

    scheduler.push({
      sessionID: "root",
      messageID: "msg_1",
      part: textPart("prt_1"),
      delta: { type: "text-delta", textDelta: "hello " },
    })
    scheduler.push({
      sessionID: "root",
      messageID: "msg_1",
      part: textPart("prt_1"),
      delta: { type: "text-delta", textDelta: "world" },
    })
    scheduler.flush()

    expect(sent).toEqual([
      {
        type: "partUpdated",
        sessionID: "root",
        messageID: "msg_1",
        part: textPart("prt_1", "hello world"),
        delta: { type: "text-delta", textDelta: "hello world" },
      },
    ])
  })

  test("flushes buffered deltas before full part updates", () => {
    const sent: ExtensionToWebview[] = []
    const scheduler = new RaccoonStreamScheduler((message) => sent.push(message))

    scheduler.push({
      sessionID: "root",
      messageID: "msg_1",
      part: textPart("prt_1"),
      delta: { type: "text-delta", textDelta: "partial" },
    })
    scheduler.push({
      sessionID: "root",
      messageID: "msg_1",
      part: textPart("prt_1", "complete"),
    })
    scheduler.flush()

    expect(sent).toEqual([
      {
        type: "partUpdated",
        sessionID: "root",
        messageID: "msg_1",
        part: textPart("prt_1", "partial"),
        delta: { type: "text-delta", textDelta: "partial" },
      },
      {
        type: "partUpdated",
        sessionID: "root",
        messageID: "msg_1",
        part: textPart("prt_1", "complete"),
      },
    ])
  })

  test("keeps identical message and part IDs separate across sessions", () => {
    const sent: ExtensionToWebview[] = []
    const scheduler = new RaccoonStreamScheduler((message) => sent.push(message))

    scheduler.push({
      sessionID: "child-a",
      messageID: "msg_1",
      part: textPart("prt_1"),
      delta: { type: "text-delta", textDelta: "A" },
    })
    scheduler.push({
      sessionID: "child-b",
      messageID: "msg_1",
      part: textPart("prt_1"),
      delta: { type: "text-delta", textDelta: "B" },
    })
    scheduler.flush()

    expect(sent).toEqual([
      {
        type: "partsUpdated",
        updates: [
          {
            sessionID: "child-a",
            messageID: "msg_1",
            part: textPart("prt_1", "A"),
            delta: { type: "text-delta", textDelta: "A" },
          },
          {
            sessionID: "child-b",
            messageID: "msg_1",
            part: textPart("prt_1", "B"),
            delta: { type: "text-delta", textDelta: "B" },
          },
        ],
      },
    ])
  })
})
