export type SkillMarketplaceScope = "project" | "user"

export type SkillMarketplaceSource = {
  id: string
  label: string
  description: string
  source: string
  defaultSubpath?: string
  sourceType: "github"
}

export type SkillMarketplaceItem = {
  id: string
  name: string
  title?: string
  description?: string
  category?: string
  sourceID: string
  sourceLabel: string
  repoSource: string
  repoSubpath?: string
  skillDir: string
  installable: boolean
  warnings?: string[]
  repositoryUrl?: string
}

export type SkillMarketplaceInstalledMetadata = {
  project: Record<string, { type: "skill" }>
  user: Record<string, { type: "skill" }>
}

export type SkillMarketplaceDataResponse = {
  sources: SkillMarketplaceSource[]
  items: SkillMarketplaceItem[]
  installed: SkillMarketplaceInstalledMetadata
  errors?: string[]
}

export type SkillMarketplaceInstallOptions = {
  scope: SkillMarketplaceScope
}

export type SkillMarketplaceInstallResult = {
  success: boolean
  id: string
  scope?: SkillMarketplaceScope
  error?: string
}

export type SkillMarketplaceRemoveResult = SkillMarketplaceInstallResult

export type SkillMarketplaceInstalledSkill = {
  id: string
  name: string
  description?: string
  scope: SkillMarketplaceScope
  location: string
  // True when the skill is not managed under the project/user skill dirs
  // (e.g. opencode built-ins with location "<built-in>", or .claude/.agents/config-URL skills).
  builtin?: boolean
  // False for built-ins — the panel hides the Remove button for these.
  removable: boolean
}
