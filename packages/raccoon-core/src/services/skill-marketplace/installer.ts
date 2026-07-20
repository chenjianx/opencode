import { access, cp, lstat, mkdir, readdir, rm } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { dirname, join, resolve, sep } from "node:path"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import { pickProjectConfigDirName } from "../../provider/config/config-paths.js"
import { assertGitAvailable, looksLikeAuthError, runGit } from "./git.js"
import { parseSkillRepoSource } from "./source.js"
import type {
  SkillMarketplaceInstallOptions,
  SkillMarketplaceInstallResult,
  SkillMarketplaceInstalledMetadata,
  SkillMarketplaceInstalledSkill,
  SkillMarketplaceItem,
  SkillMarketplaceRemoveResult,
  SkillMarketplaceScope,
} from "./types.js"

const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

export class SkillMarketplaceInstaller {
  async detect(client: OpencodeClient, directory: string): Promise<SkillMarketplaceInstalledMetadata> {
    const [project, user] = await Promise.all([
      projectSkillRoot(directory).then(listSkillNames),
      this.userSkillRoot(client, directory).then(listSkillNames),
    ])
    return {
      project: Object.fromEntries(project.map((id) => [id, { type: "skill" as const }])),
      user: Object.fromEntries(user.map((id) => [id, { type: "skill" as const }])),
    }
  }

  async listInstalled(client: OpencodeClient, directory: string): Promise<SkillMarketplaceInstalledSkill[]> {
    // Source the full, authoritative list from opencode's /skill API so built-in skills
    // (location "<built-in>") and skills from .claude/.agents/config URLs show up too — the
    // on-disk scan of .opencode/skills + <config>/skills alone misses all of those.
    const [response, projectRoot, userRoot] = await Promise.all([
      client.app.skills({ directory }, { throwOnError: true }),
      projectSkillRoot(directory),
      this.userSkillRoot(client, directory),
    ])
    const skills = response.data ?? []
    const classified = await Promise.all(
      skills.map(async (skill) => {
        const installed = classifyInstalledSkill(skill, projectRoot, userRoot)
        if (!installed.removable) return installed
        return (await exists(join(installed.scope === "project" ? projectRoot : userRoot, installed.id))) ? installed : undefined
      }),
    )
    return classified
      .filter((skill): skill is SkillMarketplaceInstalledSkill => skill !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async install(
    client: OpencodeClient,
    directory: string,
    item: SkillMarketplaceItem,
    options: SkillMarketplaceInstallOptions,
  ): Promise<SkillMarketplaceInstallResult> {
    if (!item.installable || !SKILL_NAME_PATTERN.test(item.name)) {
      return { success: false, id: item.id, scope: options.scope, error: "This skill cannot be installed." }
    }

    const target = await this.targetDir(client, directory, item.name, options.scope)
    if (await exists(target)) {
      return { success: false, id: item.id, scope: options.scope, error: `Skill "${item.name}" is already installed.` }
    }

    const git = await assertGitAvailable()
    if (!git.ok) return { success: false, id: item.id, scope: options.scope, error: git.error }

    const parsed = parseSkillRepoSource(item.repoSource, item.repoSubpath)
    if (!parsed.ok) return { success: false, id: item.id, scope: options.scope, error: parsed.error }

    const temp = await import("node:fs/promises").then((fs) => fs.mkdtemp(join(tmpdir(), "raccoon-skills-install-")))
    try {
      const clone = await cloneRepo(parsed.cloneUrl, temp)
      if (!clone.ok) {
        const message = `${clone.stderr}\n${clone.message ?? ""}`.trim()
        return {
          success: false,
          id: item.id,
          scope: options.scope,
          error: looksLikeAuthError(message) ? "Authentication required to access this skill source." : message || "Failed to clone skill source.",
        }
      }

      const sparse = await runGit(["-C", temp, "sparse-checkout", "init", "--cone"], { timeoutMs: 15_000 })
      if (!sparse.ok) return { success: false, id: item.id, scope: options.scope, error: sparse.stderr || sparse.message }
      const set = await runGit(["-C", temp, "sparse-checkout", "set", item.skillDir], { timeoutMs: 30_000 })
      if (!set.ok) return { success: false, id: item.id, scope: options.scope, error: set.stderr || set.message }
      const checkout = await runGit(["-C", temp, "checkout", "--force", "HEAD"], { timeoutMs: 60_000 })
      if (!checkout.ok) return { success: false, id: item.id, scope: options.scope, error: checkout.stderr || checkout.message }

      const source = join(temp, ...item.skillDir.split("/"))
      if (!(await exists(join(source, "SKILL.md")))) {
        return { success: false, id: item.id, scope: options.scope, error: "Selected skill does not contain SKILL.md." }
      }

      await assertNoSymlinks(source)
      await mkdir(dirname(target), { recursive: true })
      await cp(source, target, { recursive: true, errorOnExist: true })
      await reloadSkills(client, directory, options.scope)
      return { success: true, id: item.id, scope: options.scope }
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  }

  async remove(
    client: OpencodeClient,
    directory: string,
    item: SkillMarketplaceItem,
    scope: SkillMarketplaceScope,
  ): Promise<SkillMarketplaceRemoveResult> {
    return await this.removeById(client, directory, item.name, scope)
  }

  async removeById(
    client: OpencodeClient,
    directory: string,
    name: string,
    scope: SkillMarketplaceScope,
  ): Promise<SkillMarketplaceRemoveResult> {
    if (!SKILL_NAME_PATTERN.test(name)) return { success: false, id: name, scope, error: "Invalid skill name." }
    await rm(await this.targetDir(client, directory, name, scope), { recursive: true, force: true })
    await reloadSkills(client, directory, scope)
    return { success: true, id: name, scope }
  }

  private async targetDir(client: OpencodeClient, directory: string, name: string, scope: SkillMarketplaceScope) {
    return join(scope === "project" ? await projectSkillRoot(directory) : await this.userSkillRoot(client, directory), name)
  }

  private async userSkillRoot(client: OpencodeClient, directory: string) {
    const response = await client.path.get({ directory }, { throwOnError: true })
    return join(response.data?.config ?? join(homedir(), ".config", "raccoon"), "skills")
  }
}

async function projectSkillRoot(directory: string) {
  return join(directory, await pickProjectConfigDirName(directory), "skills")
}

async function reloadSkills(client: OpencodeClient, directory: string, scope: SkillMarketplaceScope) {
  if (scope === "user") {
    await client.global.dispose({ throwOnError: true }).catch(() => undefined)
  }
  await client.instance.dispose({ directory }, { throwOnError: true }).catch(() => undefined)
}

async function cloneRepo(cloneUrl: string, temp: string) {
  const preferred = await runGit(["clone", "--depth", "1", "--filter=blob:none", "--no-checkout", cloneUrl, temp], {
    timeoutMs: 90_000,
  })
  if (preferred.ok) return preferred
  return await runGit(["clone", "--depth", "1", "--no-checkout", cloneUrl, temp], { timeoutMs: 90_000 })
}

async function exists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function listSkillNames(root: string) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const names = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && SKILL_NAME_PATTERN.test(entry.name))
      .map(async (entry) => ((await exists(join(root, entry.name, "SKILL.md"))) ? entry.name : undefined)),
  )
  return names.filter((name): name is string => name !== undefined)
}

// Classify a skill returned by opencode's /skill API. On-disk project/user skills are
// removable; everything else (built-in "<built-in>", .claude/.agents, config-URL cache) is
// shown read-only so the panel can hide its Remove button.
function classifyInstalledSkill(
  skill: { name: string; description?: string; location: string },
  projectRoot: string,
  userRoot: string,
): SkillMarketplaceInstalledSkill {
  const normalized = resolve(skill.location)
  const base = { id: skill.name, name: skill.name, description: skill.description, location: skill.location }
  if (isUnder(normalized, projectRoot)) return { ...base, scope: "project", removable: true }
  if (isUnder(normalized, userRoot)) return { ...base, scope: "user", removable: true }
  return { ...base, scope: "user", builtin: true, removable: false }
}

function isUnder(target: string, root: string) {
  const base = resolve(root)
  return target === base || target.startsWith(base + sep)
}

async function assertNoSymlinks(root: string) {
  const rootReal = resolve(root)
  const visit = async (current: string) => {
    if (!resolve(current).startsWith(rootReal)) throw new Error("Invalid skill path.")
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const next = join(current, entry.name)
      const stat = await lstat(next)
      if (stat.isSymbolicLink()) throw new Error("Symlinks are not supported in skills.")
      if (stat.isDirectory()) await visit(next)
    }
  }
  await visit(root)
}
