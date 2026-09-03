import { describe, expect, test } from "bun:test"
import { diffFiles } from "./message-list-diff"
import { sessionUsage } from "./message-list-format"
import { turnPartGroups, visibleParts } from "./message-list-model"
import { parseFileReference } from "../../ui/markdown-lite"
import type { RaccoonMessage, RaccoonMessagePart } from "../../../protocol"

const message = (parts: RaccoonMessagePart[], id = "msg_1") =>
  ({
    id,
    role: "assistant",
    text: "",
    parts,
    createdAt: 1,
  }) satisfies RaccoonMessage

describe("visibleParts", () => {
  test("hides patch metadata", () => {
    expect(visibleParts(message([{ id: "prt_1", type: "patch", title: "patch" }]))).toEqual([])
  })

  test("keeps apply_patch tool calls visible", () => {
    const part = { id: "prt_1", type: "tool", tool: "apply_patch" } satisfies RaccoonMessagePart

    expect(visibleParts(message([part]))).toEqual([part])
  })
})

describe("turnPartGroups", () => {
  test("keeps consecutive tools in one activity block across assistant messages", () => {
    const first = message([{ id: "prt_read", type: "tool", tool: "read" }], "msg_1")
    const second = message([{ id: "prt_grep", type: "tool", tool: "grep" }], "msg_2")

    expect(turnPartGroups([first, second])).toEqual([
      {
        type: "tools",
        entries: [
          { messageID: "msg_1", part: first.parts[0] },
          { messageID: "msg_2", part: second.parts[0] },
        ],
      },
    ])
  })

  test("starts a new activity block after assistant reasoning", () => {
    const first = message([{ id: "prt_read", type: "tool", tool: "read" }], "msg_1")
    const second = message(
      [
        { id: "prt_reasoning", type: "reasoning", text: "Compare the results." },
        { id: "prt_grep", type: "tool", tool: "grep" },
      ],
      "msg_2",
    )

    expect(turnPartGroups([first, second])).toEqual([
      { type: "tools", entries: [{ messageID: "msg_1", part: first.parts[0] }] },
      { type: "part", entry: { messageID: "msg_2", part: second.parts[0] } },
      { type: "tools", entries: [{ messageID: "msg_2", part: second.parts[1] }] },
    ])
  })

  test("keeps an inline question at its assistant message boundary", () => {
    const first = message([{ id: "prt_read", type: "tool", tool: "read" }], "msg_1")
    const second = message([{ id: "prt_grep", type: "tool", tool: "grep" }], "msg_2")

    expect(turnPartGroups([first, second], new Set(["msg_1"]))).toEqual([
      { type: "tools", entries: [{ messageID: "msg_1", part: first.parts[0] }] },
      { type: "boundary", messageID: "msg_1" },
      { type: "tools", entries: [{ messageID: "msg_2", part: second.parts[0] }] },
    ])
  })

  test("keeps the assistant message text when no text part exists", () => {
    const assistant = {
      ...message([{ id: "prt_read", type: "tool", tool: "read" }], "msg_1"),
      text: "Fallback summary",
    }

    expect(turnPartGroups([assistant])).toEqual([
      { type: "tools", entries: [{ messageID: "msg_1", part: assistant.parts[0] }] },
      {
        type: "part",
        entry: { messageID: "msg_1", part: { id: "msg_1", type: "text", text: "Fallback summary" } },
      },
    ])
  })
})

describe("diffFiles", () => {
  test("uses the first parsed patch file when the path does not match exactly", () => {
    const part = {
      id: "prt_1",
      type: "tool",
      tool: "apply_patch",
      input: {
        filePath: "/workspace/src/app.ts",
      },
      metadata: {
        files: [
          {
            filePath: "/workspace/src/app.ts",
            relativePath: "src/app.ts",
            type: "update",
            patch: `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@
-old
+new`,
            additions: 1,
            deletions: 1,
          },
        ],
      },
    } satisfies RaccoonMessagePart

    const files = diffFiles(part)

    expect(files).toHaveLength(1)
    expect(files[0]?.path).toBe("src/app.ts")
    expect(files[0]?.additions).toBe(1)
    expect(files[0]?.deletions).toBe(1)
  })
})

describe("sessionUsage", () => {
  test("sums input, output, total tokens, and cost", () => {
    const messages = [
      {
        id: "msg_1",
        role: "assistant",
        text: "",
        parts: [],
        createdAt: 1,
        tokens: { input: 100, output: 40, reasoning: 10, cache: { read: 5, write: 3 }, total: 180 },
        cost: 0.01,
      },
      {
        id: "msg_2",
        role: "assistant",
        text: "",
        parts: [],
        createdAt: 2,
        tokens: { input: 20, output: 8, reasoning: 2, cache: { read: 1, write: 1 } },
        cost: 0.02,
      },
    ] satisfies RaccoonMessage[]

    expect(sessionUsage(messages)).toEqual({
      input: 120,
      output: 48,
      cacheRead: 6,
      cacheWrite: 4,
      total: 212,
      cost: 0.03,
    })
  })
})

describe("parseFileReference", () => {
  test("accepts a line range and opens it at the first line", () => {
    expect(parseFileReference("box_agent/tools/todo_tool.py:223-227")).toEqual({
      filePath: "box_agent/tools/todo_tool.py",
      line: 223,
      column: undefined,
    })
  })
})
