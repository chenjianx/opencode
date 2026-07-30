import type { I18nKey } from "./i18n/en"
import type { RaccoonAgent } from "./protocol"

const BUILTIN_AGENT_DESCRIPTION_KEYS: Record<string, I18nKey> = {
  ask: "agent.description.ask",
  build: "agent.description.build",
  explore: "agent.description.explore",
  general: "agent.description.general",
  plan: "agent.description.plan",
} satisfies Record<string, I18nKey>

export function agentDisplayDescription(agent: Pick<RaccoonAgent, "name" | "description" | "native">, t: (key: I18nKey) => string) {
  if (agent.native) return t(BUILTIN_AGENT_DESCRIPTION_KEYS[agent.name] ?? "agent.description.fallback")
  return agent.description
}
