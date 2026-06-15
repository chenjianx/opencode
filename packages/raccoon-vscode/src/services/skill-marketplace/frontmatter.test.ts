import { describe, expect, test } from "bun:test"
import { parseSkillFrontmatter } from "./frontmatter"

describe("parseSkillFrontmatter", () => {
  test("reads single-line name and description", () => {
    expect(
      parseSkillFrontmatter(`---\nname: claude-api\ndescription: Use Claude API.\n---\nbody`),
    ).toEqual({
      name: "claude-api",
      description: "Use Claude API.",
    })
  })

  test("reads folded block descriptions", () => {
    expect(
      parseSkillFrontmatter(`---\nname: claude-api\ndescription: >\n  Build integrations with the Claude API.\n  Use for Messages, tools, streaming, and auth.\n---\nbody`),
    ).toEqual({
      name: "claude-api",
      description: "Build integrations with the Claude API. Use for Messages, tools, streaming, and auth.",
    })
  })

  test("reads literal block descriptions", () => {
    expect(
      parseSkillFrontmatter(`---\nname: claude-api\ndescription: |\n  Build integrations with the Claude API.\n  Use for SDK examples.\n---\nbody`),
    ).toEqual({
      name: "claude-api",
      description: "Build integrations with the Claude API.\nUse for SDK examples.",
    })
  })
})
