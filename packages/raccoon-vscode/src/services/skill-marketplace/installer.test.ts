import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SkillMarketplaceInstaller } from "./installer"

function client(config: string, calls?: { instanceDispose: number; globalDispose: number }) {
  return {
    path: {
      get: async () => ({ data: { config } }),
    },
    instance: {
      dispose: async () => {
        if (calls) calls.instanceDispose++
      },
    },
    global: {
      dispose: async () => {
        if (calls) calls.globalDispose++
      },
    },
  } as never
}

async function writeSkill(root: string, name: string, description: string) {
  const dir = join(root, name)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nUse this skill.\n`,
  )
}

describe("SkillMarketplaceInstaller", () => {
  test("detects project and user installed skills", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "raccoon-skill-workspace-"))
    const configDir = await mkdtemp(join(tmpdir(), "raccoon-skill-config-"))
    try {
      await writeSkill(join(workspace, ".opencode", "skills"), "project-skill", "Project skill")
      await writeSkill(join(configDir, "skills"), "user-skill", "User skill")

      const installer = new SkillMarketplaceInstaller()
      const installed = await installer.detect(client(configDir), workspace)
      const list = await installer.listInstalled(client(configDir), workspace)

      expect(installed.project["project-skill"]).toEqual({ type: "skill" })
      expect(installed.user["user-skill"]).toEqual({ type: "skill" })
      expect(list.map((skill) => `${skill.scope}:${skill.id}`)).toEqual(["project:project-skill", "user:user-skill"])
      expect(list.find((skill) => skill.id === "project-skill")?.description).toBe("Project skill")
    } finally {
      await rm(workspace, { recursive: true, force: true })
      await rm(configDir, { recursive: true, force: true })
    }
  })

  test("removes installed skills by scope", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "raccoon-skill-workspace-"))
    const configDir = await mkdtemp(join(tmpdir(), "raccoon-skill-config-"))
    try {
      await writeSkill(join(workspace, ".opencode", "skills"), "project-skill", "Project skill")
      await writeSkill(join(configDir, "skills"), "user-skill", "User skill")

      const installer = new SkillMarketplaceInstaller()
      const projectCalls = { instanceDispose: 0, globalDispose: 0 }
      const userCalls = { instanceDispose: 0, globalDispose: 0 }
      await expect(installer.removeById(client(configDir, projectCalls), workspace, "project-skill", "project")).resolves.toMatchObject({
        success: true,
      })
      await expect(installer.removeById(client(configDir, userCalls), workspace, "user-skill", "user")).resolves.toMatchObject({
        success: true,
      })

      await expect(readFile(join(workspace, ".opencode", "skills", "project-skill", "SKILL.md"), "utf8")).rejects.toThrow()
      await expect(readFile(join(configDir, "skills", "user-skill", "SKILL.md"), "utf8")).rejects.toThrow()
      expect(projectCalls).toEqual({ instanceDispose: 1, globalDispose: 0 })
      expect(userCalls).toEqual({ instanceDispose: 1, globalDispose: 1 })
    } finally {
      await rm(workspace, { recursive: true, force: true })
      await rm(configDir, { recursive: true, force: true })
    }
  })
})
