// raccoon_change - extraction layer: centralizes the raccoon provider branding
// (priority + recommended hint) that was duplicated across providers.ts,
// dialog-provider.tsx, and their tests. Upstream files keep their own priority
// maps; these helpers force raccoon to the top and supply the recommended hint.

export const RACCOON_ID = "raccoon"

// Recommended-login hint text. The CLI and the TUI render it differently.
export const cliHint = "recommended"
export const tuiHint = "(Recommended)"

/**
 * Priority used for provider sorting. Raccoon always sorts first; every other
 * provider falls back to its position in the caller's upstream priority map.
 */
export const priority = (id: string, base: Record<string, number>): number =>
  id === RACCOON_ID ? -1 : (base[id] ?? 99)

/**
 * Provider hint/description text. Raccoon gets the recommended label; every
 * other provider keeps the caller's upstream hint (if any).
 */
export const hint = (
  id: string,
  base: Record<string, string | undefined>,
  recommended: string,
): string | undefined => (id === RACCOON_ID ? recommended : base[id])

export * as RaccoonBranding from "./branding"
