// raccoon_change start - bundle Raccoon cloud knowledge skill as an internal skill
import { mkdir } from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { AbsolutePath } from "../schema"
import { ConfigMarkdown } from "../config/markdown"
import { Global } from "../global"
import { SkillV2 } from "../skill"
import skillFile from "./knowledge-skill/SKILL.md" with { type: "text" }
import apiReference from "./knowledge-skill/references/api.md" with { type: "text" }
import knowledgeClient from "./knowledge-skill/scripts/knowledge_mcp_client.py" with { type: "text" }

const parsed = ConfigMarkdown.parse(skillFile)

export const name = "knowledge"
export const description =
  "Load this skill (via the skill tool) when the user asks to look up, search, or answer questions from Raccoon cloud knowledge bases. This is a skill, not a directly callable tool."

export const directory = () =>
  path.join(
    process.env.OPENCODE_TEST_HOME ? path.join(process.env.OPENCODE_TEST_HOME, ".cache", "raccoon") : Global.Path.cache,
    "builtin-skills",
    name,
  )

export const materialize = Effect.fn("RaccoonKnowledgeSkill.materialize")(function* () {
  const root = directory()
  yield* Effect.promise(async () => {
    await Promise.all([
      mkdir(path.join(root, "references"), { recursive: true }),
      mkdir(path.join(root, "scripts"), { recursive: true }),
    ])
    await Promise.all([
      Bun.write(path.join(root, "SKILL.md"), skillFile),
      Bun.write(path.join(root, "references", "api.md"), apiReference),
      Bun.write(path.join(root, "scripts", "knowledge_mcp_client.py"), knowledgeClient),
    ])
  }).pipe(Effect.orDie)
  return root
})

export const source = Effect.fn("RaccoonKnowledgeSkill.source")(function* () {
  return SkillV2.DirectorySource.make({
    type: "directory",
    path: AbsolutePath.make(yield* materialize()),
  })
})

export const legacyInfo = Effect.fn("RaccoonKnowledgeSkill.legacyInfo")(function* () {
  return {
    name,
    description,
    location: path.join(yield* materialize(), "SKILL.md"),
    content: parsed.content,
  }
})

export * as RaccoonKnowledgeSkill from "./knowledge-skill"
// raccoon_change end
