import { afterEach, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Permission } from "../../src/permission"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"

// raccoon_change - tests for the raccoon-specific read-only "ask" agent (src/raccoon/agents.ts),
// kept out of the upstream test/agent/agent.test.ts to minimize merge conflicts.

const agentLayer = (flags: Partial<RuntimeFlags.Info> = {}) =>
  Agent.layer.pipe(
    Layer.provide(Plugin.defaultLayer),
    Layer.provide(Provider.defaultLayer),
    Layer.provide(Auth.defaultLayer),
    Layer.provide(Config.defaultLayer),
    Layer.provide(Skill.defaultLayer),
    Layer.provide(RuntimeFlags.layer(flags)),
  )

const it = testEffect(agentLayer())

function evalPerm(agent: Agent.Info | undefined, permission: string): PermissionV1.Action | undefined {
  if (!agent) return undefined
  return Permission.evaluate(permission, "*", agent.permission).action
}

function load<A>(fn: (svc: Agent.Interface) => Effect.Effect<A>) {
  return Agent.Service.use(fn)
}

afterEach(async () => {
  await disposeAllInstances()
})

it.instance("ask is a built-in primary agent", () =>
  Effect.gen(function* () {
    const names = (yield* load((svc) => svc.list())).map((a) => a.name)
    expect(names).toContain("ask")
  }),
)

it.instance("ask agent has readonly default properties", () =>
  Effect.gen(function* () {
    const ask = yield* load((svc) => svc.get("ask"))
    expect(ask).toBeDefined()
    expect(ask?.mode).toBe("primary")
    expect(ask?.native).toBe(true)
    expect(evalPerm(ask, "edit")).toBe("deny")
    expect(evalPerm(ask, "read")).toBe("allow")
    expect(evalPerm(ask, "grep")).toBe("allow")
    expect(evalPerm(ask, "glob")).toBe("allow")
    expect(evalPerm(ask, "list")).toBe("allow")
    expect(evalPerm(ask, "question")).toBe("allow")
    expect(evalPerm(ask, "webfetch")).toBe("allow")
    expect(evalPerm(ask, "websearch")).toBe("allow")
    expect(Permission.evaluate("bash", "git status --short", ask!.permission).action).toBe("allow")
    expect(Permission.evaluate("bash", "git checkout -- file.ts", ask!.permission).action).toBe("deny")
    expect(Permission.evaluate("bash", "echo hi > file.txt", ask!.permission).action).toBe("deny")
  }),
)

it.instance(
  "ask agent permission can be further restricted by config",
  () =>
    Effect.gen(function* () {
      const ask = yield* load((svc) => svc.get("ask"))
      expect(evalPerm(ask, "webfetch")).toBe("deny")
      expect(evalPerm(ask, "read")).toBe("allow")
    }),
  {
    config: {
      agent: {
        ask: {
          permission: {
            webfetch: "deny",
          },
        },
      },
    },
  },
)
