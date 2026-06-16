import type { SkillMarketplaceSource } from "./types.js"

export const SKILL_MARKETPLACE_SOURCES: SkillMarketplaceSource[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Anthropic's public skills repository.",
    source: "anthropics/skills",
    defaultSubpath: "skills",
    sourceType: "github",
  },
]
