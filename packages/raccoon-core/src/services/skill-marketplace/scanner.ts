import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, posix } from "node:path"
import { assertGitAvailable, looksLikeAuthError, runGit } from "./git.js"
import { parseSkillFrontmatter } from "./frontmatter.js"
import { parseSkillRepoSource } from "./source.js"
import type { SkillMarketplaceItem, SkillMarketplaceSource } from "./types.js"

const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

export async function scanSkillSource(source: SkillMarketplaceSource): Promise<{ items: SkillMarketplaceItem[]; errors?: string[] }> {
  const git = await assertGitAvailable()
  if (!git.ok) return { items: [], errors: [git.error] }

  const parsed = parseSkillRepoSource(source.source, source.defaultSubpath)
  if (!parsed.ok) return { items: [], errors: [parsed.error] }

  const temp = await mkdtemp(join(tmpdir(), "raccoon-skills-scan-"))
  try {
    const clone = await cloneRepo(parsed.cloneUrl, temp)
    if (!clone.ok) {
      const message = `${clone.stderr}\n${clone.message ?? ""}`.trim()
      return {
        items: [],
        errors: [looksLikeAuthError(message) ? "Authentication required to access this skill source." : message || "Failed to clone skill source."],
      }
    }

    const patterns = parsed.effectiveSubpath
      ? [`${parsed.effectiveSubpath}/SKILL.md`, `${parsed.effectiveSubpath}/**/SKILL.md`]
      : ["SKILL.md", "**/SKILL.md"]
    await runGit(["-C", temp, "sparse-checkout", "init", "--no-cone"], { timeoutMs: 15_000 })
    await runGit(["-C", temp, "sparse-checkout", "set", ...patterns], { timeoutMs: 30_000 })
    const checkout = await runGit(["-C", temp, "checkout", "--force", "HEAD"], { timeoutMs: 60_000 })
    if (!checkout.ok) return { items: [], errors: [checkout.stderr || checkout.message || "Failed to checkout skill source."] }

    const listed = await runGit(["-C", temp, "ls-files"], { timeoutMs: 15_000 })
    if (!listed.ok) return { items: [], errors: [listed.stderr || listed.message || "Failed to list skill files."] }

    const dirs = Array.from(
      new Set(
        listed.stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.endsWith("/SKILL.md"))
          .map((line) => posix.dirname(line)),
      ),
    )

    const items = await Promise.all(dirs.map((dir) => itemFromDir(temp, dir, source, parsed.repositoryUrl)))
    return { items: items.sort((a, b) => a.name.localeCompare(b.name)) }
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}

async function cloneRepo(cloneUrl: string, temp: string) {
  const preferred = await runGit(["clone", "--depth", "1", "--filter=blob:none", "--no-checkout", cloneUrl, temp], {
    timeoutMs: 90_000,
  })
  if (preferred.ok) return preferred
  return await runGit(["clone", "--depth", "1", "--no-checkout", cloneUrl, temp], { timeoutMs: 90_000 })
}

async function itemFromDir(
  repoDir: string,
  skillDir: string,
  source: SkillMarketplaceSource,
  repositoryUrl: string,
): Promise<SkillMarketplaceItem> {
  const name = posix.basename(skillDir)
  const frontmatter = parseSkillFrontmatter(await readFile(join(repoDir, ...skillDir.split("/"), "SKILL.md"), "utf8").catch(() => ""))
  const installable = SKILL_NAME_PATTERN.test(name)
  return {
    id: `${source.id}:${skillDir}`,
    name,
    title: frontmatter.name,
    description: frontmatter.description,
    sourceID: source.id,
    sourceLabel: source.label,
    repoSource: source.source,
    repoSubpath: source.defaultSubpath,
    skillDir,
    installable,
    warnings: installable ? undefined : ["Skill directory name is not valid for opencode."],
    repositoryUrl: `${repositoryUrl}/tree/main/${skillDir}`,
  }
}
