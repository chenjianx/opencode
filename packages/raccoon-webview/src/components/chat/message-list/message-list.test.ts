import { describe, expect, test } from "bun:test"
import { diffFiles } from "./message-list-diff"
import type { RaccoonMessagePart } from "../../../protocol"

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
