import yaml from "js-yaml"
import { parseSkillRepoSource } from "./source.js"
import type { SkillMarketplaceItem, SkillMarketplaceSource } from "./types.js"

const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const FETCH_TIMEOUT_MS = 15_000
const CATALOG_FILE = "marketplace.yaml"

type RawSkill = {
  id?: unknown
  name?: unknown
  description?: unknown
  category?: unknown
}

// Build the browse list from the source repo's pre-generated `skills/marketplace.yaml`.
// The panel only needs metadata, and the YAML already carries a localized name,
// description and category per skill — so a single HTTP fetch replaces cloning the whole
// repo. Installation still clones and sparse-checks out each item's `skillDir` (installer.ts).
export async function scanSkillSource(source: SkillMarketplaceSource): Promise<{ items: SkillMarketplaceItem[]; errors?: string[] }> {
  const parsed = parseSkillRepoSource(source.source, source.defaultSubpath)
  if (!parsed.ok) return { items: [], errors: [parsed.error] }

  const subpath = parsed.effectiveSubpath ?? "skills"
  const catalogUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/main/${subpath}/${CATALOG_FILE}`

  let yamlText: string
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const response = await fetch(catalogUrl, { signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
      yamlText = await response.text()
    } finally {
      clearTimeout(timer)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { items: [], errors: [`Failed to load skill marketplace from ${catalogUrl}: ${message}`] }
  }

  const doc = yaml.load(yamlText) as { items?: RawSkill[] } | undefined
  const raw = Array.isArray(doc?.items) ? doc.items : []
  const items = raw
    .map((entry) => buildItem(entry, source, subpath, parsed.repositoryUrl))
    .filter((item): item is SkillMarketplaceItem => Boolean(item))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { items }
}

function buildItem(
  raw: RawSkill,
  source: SkillMarketplaceSource,
  subpath: string,
  repositoryUrl: string,
): SkillMarketplaceItem | undefined {
  const id = typeof raw.id === "string" ? raw.id.trim() : ""
  if (!id) return undefined
  const skillDir = `${subpath}/${id}`
  const installable = SKILL_NAME_PATTERN.test(id)
  return {
    id: `${source.id}:${skillDir}`,
    name: id,
    title: typeof raw.name === "string" ? raw.name : undefined,
    description: typeof raw.description === "string" ? raw.description.replace(/\s+/g, " ").trim() : undefined,
    category: typeof raw.category === "string" ? raw.category : undefined,
    sourceID: source.id,
    sourceLabel: source.label,
    repoSource: source.source,
    repoSubpath: subpath,
    skillDir,
    installable,
    warnings: installable ? undefined : ["Skill directory name is not valid for Raccoon."],
    repositoryUrl: `${repositoryUrl}/tree/main/${skillDir}`,
  }
}
