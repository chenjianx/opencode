import { describe, expect, test } from "bun:test"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { mapProviderModels, mapSession, mapSubSession } from "./mapping"

describe("mapProviderModels", () => {
  test("filters autocomplete-only raccoon models from selectable models", () => {
    const models = mapProviderModels(
      {
        id: "raccoon",
        name: "Raccoon",
        source: "config",
        models: {
          "raccoon-pro-completion": {
            id: "raccoon-pro-completion",
            name: "Raccoon Complete Pro",
          },
          "raccoon-completion": {
            id: "raccoon-completion",
            name: "Raccoon Complete",
          },
          "raccoon-chat": {
            id: "raccoon-chat",
            name: "Raccoon Chat",
            variants: {
              low: {},
              high: {},
            },
          },
        },
      } as never,
      true,
      new Set(),
    )

    expect(models.map((model) => model.modelID)).toEqual(["raccoon-chat"])
    expect(models[0]?.variants).toEqual(["low", "high"])
  })
})

describe("mapSubSession", () => {
  const messages = [
    {
      info: { id: "msg_1", role: "user", time: { created: 1000 } },
      parts: [{ id: "prt_1", type: "text", text: "go" }],
    },
    {
      info: { id: "msg_2", role: "assistant", time: { created: 1100, completed: 4200 } },
      parts: [
        { id: "prt_2", type: "tool", tool: "grep", state: { status: "completed", title: "search foo" } },
        { id: "prt_3", type: "tool", tool: "task", state: { status: "running", metadata: { sessionId: "ses_grand" } } },
        { id: "prt_4", type: "text", text: "done" },
      ],
    },
  ] as never

  test("derives tools, count, and timing from child session messages", () => {
    const sub = mapSubSession("ses_child", messages, "running")
    expect(sub.sessionID).toBe("ses_child")
    expect(sub.status).toBe("running")
    expect(sub.toolcalls).toBe(2)
    expect(sub.tools.map((tool) => tool.tool)).toEqual(["grep", "task"])
    expect(sub.tools[0]?.title).toBe("search foo")
    expect(sub.tools[1]?.sessionID).toBe("ses_grand")
    expect(sub.startedAt).toBe(1000)
    expect(sub.completedAt).toBe(4200)
  })

  test("handles empty child session gracefully", () => {
    const sub = mapSubSession("ses_empty", [], "idle")
    expect(sub.toolcalls).toBe(0)
    expect(sub.tools).toEqual([])
    expect(sub.startedAt).toBeUndefined()
    expect(sub.completedAt).toBeUndefined()
  })
})

describe("mapSession", () => {
  test("preserves parentID for child sessions", () => {
    const mapped = mapSession({
      id: "child",
      parentID: "root",
      title: "Child",
      agent: "build",
      time: { created: 1, updated: 2 },
    } as Session)

    expect(mapped.parentID).toBe("root")
  })
})
