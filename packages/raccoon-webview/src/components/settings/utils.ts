// Shared helpers for the settings UI. Centralizes small transforms that were
// previously duplicated across several settings components.

import type { RaccoonMarketplaceScope, RaccoonProviderAuthMethod } from "../../protocol"

type ModelSelection = { providerID: string; modelID: string }

type AuthPrompt = NonNullable<RaccoonProviderAuthMethod["prompts"]>[number]

/** Whether an auth prompt should render, based on its `when` condition. */
export function visiblePrompt(prompt: AuthPrompt, values: Record<string, string>) {
  if (!prompt.when) return true
  const value = values[prompt.when.key] ?? ""
  if (prompt.when.op === "eq") return value === prompt.when.value
  return value !== prompt.when.value
}

/** Validates a config entity name: starts alphanumeric, then word/dash chars. */
export const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

/**
 * Returns `base` if unused, otherwise `base-2`, `base-3`, … up to `base-100`,
 * picking the first candidate not already present in `existing`.
 */
export function uniqueName(base: string, existing: Iterable<string>): string {
  const names = new Set(existing)
  return (
    Array.from({ length: 100 }, (_, index) => (index === 0 ? base : `${base}-${index + 1}`)).find(
      (candidate) => !names.has(candidate),
    ) ?? base
  )
}

/**
 * Deterministic accent hue (0–359) per id, so each browser item gets a stable
 * colored avatar without bundling per-item artwork.
 */
export function avatarHue(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) % 360
  return hash
}

/** Inline style for a hue-based avatar chip (shared by MCP and Skill avatars). */
export function avatarStyle(hue: number) {
  return {
    background: `hsl(${hue} 60% 50% / 0.18)`,
    color: `hsl(${hue} 70% 70%)`,
    borderColor: `hsl(${hue} 60% 50% / 0.35)`,
  }
}

/** Returns the scope a marketplace item is installed in, or undefined if not installed. */
export function installedIn<T>(
  installed: { project: Record<string, T>; user: Record<string, T> },
  key: string,
): RaccoonMarketplaceScope | undefined {
  if (installed.project[key]) return "project"
  if (installed.user[key]) return "user"
  return undefined
}

/**
 * Title-cases an identifier for display: replaces dashes/underscores with
 * spaces and upper-cases the first letter of each word. Handles grouped labels
 * like "todoread / todowrite" as well.
 */
export function titleCase(value: string): string {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

/** Encodes a model selection as the canonical `providerID/modelID` string. */
export function formatModelString(model: ModelSelection): string {
  return `${model.providerID}/${model.modelID}`
}

/** Parses a `providerID/modelID` string, returning undefined when malformed. */
export function parseModelString(value: unknown): ModelSelection | undefined {
  if (typeof value !== "string") return undefined
  const index = value.indexOf("/")
  // Reject missing providerID (leading slash) and empty modelID (trailing slash).
  if (index <= 0 || index === value.length - 1) return undefined
  return { providerID: value.slice(0, index), modelID: value.slice(index + 1) }
}

/** Valid ranges for the optional numeric agent parameters. */
export const PARAM_RANGE = {
  temperature: { min: 0, max: 2 },
  topP: { min: 0, max: 1 },
  steps: { min: 1, max: 100 },
} as const

/** Parses a numeric string and clamps it to [min, max]; undefined when blank/NaN. */
export function numeric(value: string, min: number, max: number): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return Math.min(max, Math.max(min, parsed))
}

/** Parses and clamps a string against one of the named PARAM_RANGE entries. */
export function clampParam(value: string, param: keyof typeof PARAM_RANGE): number | undefined {
  const { min, max } = PARAM_RANGE[param]
  return numeric(value, min, max)
}

/** Triggers a client-side download of `data` serialized as pretty JSON. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
