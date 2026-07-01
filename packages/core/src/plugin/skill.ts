/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill"

import { define } from "./internal"
import { Effect } from "effect"
import { AbsolutePath } from "../schema"
import { SkillV2 } from "../skill"
import customizeOpencodeContent from "./skill/customize-opencode.md" with { type: "text" }
import raccoonConfigContent from "./skill/raccoon-config.md" with { type: "text" } // raccoon_change - built-in skill for installing MCP servers and skills by name
import { RaccoonKnowledgeSkill } from "../raccoon/knowledge-skill" // raccoon_change - register built-in Raccoon knowledge skill

export const CustomizeOpencodeContent = customizeOpencodeContent
export const RaccoonConfigContent = raccoonConfigContent // raccoon_change

export const Plugin = define({
  id: "skill",
  effect: Effect.fn(function* (ctx) {
    const raccoonKnowledgeSource = yield* RaccoonKnowledgeSkill.source() // raccoon_change - materialize bundled Raccoon skill before sync draft edit
    yield* ctx.skill.transform((draft) => {
      /*
      draft.source(
        SkillV2.EmbeddedSource.make({
          type: "embedded",
          skill: SkillV2.Info.make({
            name: "customize-opencode",
            description:
              "Use ONLY when the user is editing or creating opencode's own configuration: opencode.json, opencode.jsonc, files under .opencode/, or files under ~/.config/opencode/. Also use when creating or fixing opencode agents, subagents, commands, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring opencode itself.",
            location: AbsolutePath.make("/builtin/customize-opencode.md"),
            content: CustomizeOpencodeContent,
          }),
        }),
      ) */
      // raccoon_change - built-in skill: install MCP servers / skills from the Raccoon marketplace by name
      draft.source(
        SkillV2.EmbeddedSource.make({
          type: "embedded",
          skill: SkillV2.Info.make({
            name: "raccoon-config",
            description:
              "Use when the user wants to install, add, or set up (安装 / 新增) an MCP server or a skill by name from the Raccoon marketplace — e.g. \"装个 playwright mcp\", \"add the github mcp\", \"安装 pdf skill\". Fetches the marketplace catalog, writes the MCP config, or clones the skill directory. Do not use for general opencode config editing (use customize-opencode) or for the user's own application code.",
            location: AbsolutePath.make("/builtin/raccoon-config.md"),
            content: RaccoonConfigContent,
          }),
        }),
      )
      draft.source(raccoonKnowledgeSource) // raccoon_change - include bundled Raccoon knowledge skill directory
    })
  }),
})
