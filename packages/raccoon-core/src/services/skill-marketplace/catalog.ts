import type { SkillMarketplaceSource } from "./types.js"

export const SKILL_MARKETPLACE_SOURCES: SkillMarketplaceSource[] = [
  {
    id: "raccoon",
    label: "Raccoon",
    description: "Raccoon marketplace skills repository.",
    source: "chenjianx/raccoon-marketplace",
    defaultSubpath: "skills",
    sourceType: "github",
  },
]
