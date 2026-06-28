import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { SkillPlugin } from "@opencode-ai/core/plugin/skill"
import { RaccoonKnowledgeSkill } from "@opencode-ai/core/raccoon/knowledge-skill" // raccoon_change - verify bundled Raccoon knowledge skill registration
import { SkillV2 } from "@opencode-ai/core/skill"
import { testEffect } from "../lib/effect"
import { host } from "./host"
import { tmpdir } from "../fixture/tmpdir"
import path from "path"

const it = testEffect(AppNodeBuilder.build(SkillV2.node))

describe("SkillPlugin.Plugin", () => {
  it.effect("registers built-in skills", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const home = process.env.OPENCODE_TEST_HOME
          process.env.OPENCODE_TEST_HOME = tmp.path // raccoon_change - materialize bundled Raccoon skill inside writable test home
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              process.env.OPENCODE_TEST_HOME = home
            }),
          )
          const skill = yield* SkillV2.Service
          yield* SkillPlugin.Plugin.effect(host({ skill: { ...skill, reload: skill.reload } }))
          const list = yield* skill.list()

          expect(list).toContainEqual(
            expect.objectContaining({
              name: "customize-opencode",
              description: expect.stringContaining("opencode's own configuration"),
            }),
          )
          const raccoon = list.find((item) => item.name === RaccoonKnowledgeSkill.name) // raccoon_change - confirm Raccoon skill materializes as a directory skill
          expect(raccoon).toEqual(
            expect.objectContaining({
              name: "knowledge",
              description: expect.stringContaining("Raccoon cloud knowledge"),
            }),
          )
          expect(yield* Effect.promise(() => Bun.file(path.join(path.dirname(raccoon!.location), "references", "api.md")).exists())).toBe(true) // raccoon_change - keep reference file available to skill tool
          expect(
            yield* Effect.promise(() =>
              Bun.file(path.join(path.dirname(raccoon!.location), "scripts", "knowledge_mcp_client.py")).exists(),
            ),
          ).toBe(true) // raccoon_change - keep client script available to skill tool
        }),
      ),
    ),
  )
})
