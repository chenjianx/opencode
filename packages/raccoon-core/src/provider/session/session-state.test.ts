import { describe, expect, test } from "bun:test"
import type { RaccoonMessage } from "@opencode-ai/raccoon-webview"
import { upsertMessage } from "./session-state"

describe("upsertMessage", () => {
  test("refreshes assistant footer metadata without replacing streamed content", () => {
    const messages: RaccoonMessage[] = [
      {
        id: "msg_assistant",
        role: "assistant",
        text: "Done",
        parts: [{ id: "prt_text", type: "text", text: "Done" }],
        createdAt: 1_200,
      },
    ]

    const [message] = upsertMessage(messages, {
      id: "msg_assistant",
      sessionID: "ses_main",
      role: "assistant",
      time: { created: 1_200, completed: 4_400 },
      agent: "build",
      providerID: "raccoon",
      modelID: "raccoon-pro",
      tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
      cost: 0,
    } as never)

    expect(message).toMatchObject({
      text: "Done",
      parts: [{ id: "prt_text", type: "text", text: "Done" }],
      completedAt: 4_400,
      agent: "build",
      providerID: "raccoon",
      modelID: "raccoon-pro",
    })
  })
})
