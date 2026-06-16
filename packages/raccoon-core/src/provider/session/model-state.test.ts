import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import { ModelStateStore } from "./model-state"

function clientFor(state: string) {
  return {
    path: {
      get: async () => ({ data: { state } }),
    },
  } as unknown as OpencodeClient
}

describe("ModelStateStore", () => {
  test("persists selected and mode models together", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "raccoon-model-state-"))
    try {
      const store = new ModelStateStore(() => "/workspace")
      const client = clientFor(dir)

      await store.write(client, {
        selected: { providerID: "openai", modelID: "gpt-5" },
        model: {
          build: { providerID: "anthropic", modelID: "claude-sonnet-4" },
          plan: { providerID: "raccoon", modelID: "big-pickle" },
          ask: { providerID: "openai", modelID: "gpt-4.1" },
        },
      })

      expect(await store.load(client, { model: {} })).toEqual({
        selected: { providerID: "openai", modelID: "gpt-5" },
        model: {
          build: { providerID: "anthropic", modelID: "claude-sonnet-4" },
          plan: { providerID: "raccoon", modelID: "big-pickle" },
          ask: { providerID: "openai", modelID: "gpt-4.1" },
        },
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
