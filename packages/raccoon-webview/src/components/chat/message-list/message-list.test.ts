import { describe, expect, test } from "bun:test"
import { diffFiles } from "./message-list-diff"
import { sessionUsage } from "./message-list-format"
import { parseFileReference } from "../../ui/markdown-lite"
import type { RaccoonMessage, RaccoonMessagePart } from "../../../protocol"

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
