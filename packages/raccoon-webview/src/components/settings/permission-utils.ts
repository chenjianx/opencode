import type { RaccoonPermissionAction, RaccoonPermissionConfig, RaccoonPermissionRule } from "../../protocol"

// A permission rule value as stored in the config object: a single action,
// or a per-pattern map of actions. `null` is used only inside patches to mean
// "clear this key".
export type PermissionRuleValue = RaccoonPermissionConfig[string]
export type PermissionPatchValue = RaccoonPermissionAction | null | Record<string, RaccoonPermissionAction | null>
export type PermissionPatch = Record<string, PermissionPatchValue>

const RESTRICTION_ORDER: Record<RaccoonPermissionAction, number> = { allow: 0, ask: 1, deny: 2 }

function matchTool(tool: string, pattern: string): boolean {
  if (pattern === tool || pattern === "*") return true
  if (!pattern.includes("*")) return false
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
  return new RegExp(`^${escaped}$`).test(tool)
}

// Effective wildcard level for a tool, derived from the resolved ruleset the
// backend already computed (last matching rule with pattern "*" wins).
export function effectiveRuleLevel(
  rules: RaccoonPermissionRule[] | undefined,
  tool: string,
): RaccoonPermissionAction {
  const list = rules ?? []
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i]
    if (item && item.pattern === "*" && matchTool(tool, item.permission)) return item.action
  }
  return "ask"
}

export function mostRestrictive(levels: RaccoonPermissionAction[]): RaccoonPermissionAction {
  return levels.reduce<RaccoonPermissionAction>(
    (best, level) => (RESTRICTION_ORDER[level] > RESTRICTION_ORDER[best] ? level : best),
    levels[0] ?? "allow",
  )
}

export function wildcardAction(
  rule: PermissionRuleValue | undefined,
  fallback: RaccoonPermissionAction,
): RaccoonPermissionAction {
  if (rule === undefined || rule === null) return fallback
  if (typeof rule === "string") return rule
  return rule["*"] ?? fallback
}

export function inheritedWildcard(rule: PermissionRuleValue | undefined): boolean {
  if (rule === undefined || rule === null) return true
  if (typeof rule === "string") return false
  return rule["*"] === undefined
}

export function permissionExceptions(
  rule: PermissionRuleValue | undefined,
): Array<{ pattern: string; action: RaccoonPermissionAction }> {
  if (!rule || typeof rule === "string") return []
  return Object.entries(rule)
    .filter(([key, action]) => key !== "*" && action != null)
    .map(([pattern, action]) => ({ pattern, action: action as RaccoonPermissionAction }))
}

export function setGroupedPatch(ids: string[], level: RaccoonPermissionAction): PermissionPatch {
  const patch: PermissionPatch = {}
  for (const id of ids) patch[id] = level
  return patch
}

export function clearGroupedPatch(ids: string[]): PermissionPatch {
  const patch: PermissionPatch = {}
  for (const id of ids) patch[id] = null
  return patch
}

export function setWildcardPatch(
  rule: PermissionRuleValue | undefined,
  tool: string,
  level: RaccoonPermissionAction,
): PermissionPatch {
  const excs = permissionExceptions(rule)
  if (excs.length === 0) return { [tool]: level }
  const obj: Record<string, RaccoonPermissionAction | null> = { "*": level }
  for (const exc of excs) obj[exc.pattern] = exc.action
  return { [tool]: obj }
}

export function clearWildcardPatch(rule: PermissionRuleValue | undefined, tool: string): PermissionPatch {
  const excs = permissionExceptions(rule)
  if (excs.length === 0) return { [tool]: null }
  return { [tool]: { "*": null } }
}

export function setExceptionPatch(
  rule: PermissionRuleValue | undefined,
  tool: string,
  pattern: string,
  level: RaccoonPermissionAction,
): PermissionPatch {
  const base: Record<string, RaccoonPermissionAction | null> =
    typeof rule === "string" || rule === undefined || rule === null ? (typeof rule === "string" ? { "*": rule } : {}) : { ...rule }
  base[pattern] = level
  return { [tool]: base }
}

export function addExceptionPatch(
  rule: PermissionRuleValue | undefined,
  tool: string,
  pattern: string,
): PermissionPatch {
  return setExceptionPatch(rule, tool, pattern, "allow")
}

export function removeExceptionPatch(
  rule: PermissionRuleValue | undefined,
  tool: string,
  pattern: string,
): PermissionPatch | undefined {
  if (!rule || typeof rule === "string") return undefined
  return { [tool]: { [pattern]: null } }
}

// Apply a patch to a permission config, returning a NEW config.
// - top-level `null` value removes the tool key entirely.
// - nested map merges into the existing per-pattern map; nested `null` removes
//   that pattern. A resulting map with only "*" collapses to a plain string.
//   An empty map removes the tool key.
export function mergePermissionPatch(
  config: RaccoonPermissionConfig | undefined,
  patch: PermissionPatch,
): RaccoonPermissionConfig {
  const next: RaccoonPermissionConfig = { ...(config ?? {}) }
  for (const [tool, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[tool]
      continue
    }
    if (typeof value === "string") {
      next[tool] = value
      continue
    }
    // value is a per-pattern map possibly containing nulls
    const current = next[tool]
    const base: Record<string, RaccoonPermissionAction> =
      typeof current === "string" ? { "*": current } : { ...(current ?? {}) }
    for (const [pattern, action] of Object.entries(value)) {
      if (action === null) delete base[pattern]
      else base[pattern] = action
    }
    const keys = Object.keys(base)
    const wildcardOnly = base["*"]
    if (keys.length === 0) {
      delete next[tool]
    } else if (keys.length === 1 && keys[0] === "*" && wildcardOnly !== undefined) {
      next[tool] = wildcardOnly
    } else {
      next[tool] = base
    }
  }
  return next
}
