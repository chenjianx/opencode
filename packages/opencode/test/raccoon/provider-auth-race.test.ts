// raccoon_change start - prevent stale provider callbacks from overwriting newer login credentials
import { describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Effect, Fiber, Layer } from "effect"
import path from "path"
import { Auth } from "@/auth"
import { resetDatabase } from "../fixture/db"
import { TestInstance } from "../fixture/fixture"
import { markPluginDependenciesReady } from "../fixture/plugin"
import { pollWithTimeout, testEffect } from "../lib/effect"
import { httpApiLayer, request } from "../server/httpapi-layer"

const testStateLayer = Layer.effectDiscard(
  Effect.acquireRelease(
    Effect.promise(() => resetDatabase()),
    () => Effect.promise(() => resetDatabase()),
  ),
)
const it = testEffect(
  Layer.mergeAll(testStateLayer, LayerNode.compile(FSUtil.node), LayerNode.compile(Auth.node), httpApiLayer),
)
const providerID = "test-raccoon-login-race"

function authorize(directory: string) {
  return Effect.gen(function* () {
    const response = yield* request(`/provider/${providerID}/oauth/authorize`, {
      method: "POST",
      headers: { "x-opencode-directory": directory, "content-type": "application/json" },
      body: JSON.stringify({ method: 0 }),
    })
    return yield* response.text
  })
}

function callback(directory: string) {
  return Effect.gen(function* () {
    const response = yield* request(`/provider/${providerID}/oauth/callback`, {
      method: "POST",
      headers: { "x-opencode-directory": directory, "content-type": "application/json" },
      body: JSON.stringify({ method: 0, code: "code" }),
    })
    return yield* response.text
  })
}

function writeProviderAuthPlugin(directory: string) {
  return Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    yield* Effect.promise(() => markPluginDependenciesReady(path.join(directory, ".opencode")))
    yield* fs.writeWithDirs(
      path.join(directory, ".opencode", "plugin", "provider-auth-race.ts"),
      [
        "let attempt = 0",
        "export default {",
        '  id: "test.raccoon-login-race",',
        "  server: async () => ({",
        "    auth: {",
        `      provider: "${providerID}",`,
        "      methods: [{",
        '        type: "oauth",',
        '        label: "OAuth",',
        "        authorize: async () => {",
        "          const current = ++attempt",
        "          return {",
        '            url: "https://example.com/oauth",',
        '            method: "code",',
        '            instructions: "Finish OAuth",',
        "            callback: async () => {",
        `              if (current === 1) await Bun.write(${JSON.stringify(path.join(directory, "old-callback-started"))}, "")`,
        "              if (current === 1) await new Promise((resolve) => setTimeout(resolve, 100))",
        "              return { type: 'success', key: current === 1 ? 'old-token' : 'new-token' }",
        "            },",
        "          }",
        "        },",
        "      }],",
        "    },",
        "  }),",
        "}",
        "",
      ].join("\n"),
    )
  })
}

describe("ProviderAuth callback generations", () => {
  it.instance(
    "does not let an older callback overwrite credentials from a newer authorization",
    Effect.gen(function* () {
      const directory = (yield* TestInstance).directory
      const auth = yield* Auth.Service
      const fs = yield* FSUtil.Service
      yield* authorize(directory)
      const oldCallback = yield* callback(directory).pipe(Effect.forkChild)
      yield* pollWithTimeout(
        fs.existsSafe(path.join(directory, "old-callback-started")).pipe(
          Effect.map((exists) => (exists ? true : undefined)),
        ),
        "old callback did not start",
      )
      yield* authorize(directory)
      yield* callback(directory)
      yield* Fiber.join(oldCallback)

      const credentials = yield* auth.get(providerID)
      expect(credentials).toEqual({ type: "api", key: "new-token" })
    }),
    { config: { formatter: false, lsp: false }, init: writeProviderAuthPlugin },
    30000,
  )
})
// raccoon_change end
