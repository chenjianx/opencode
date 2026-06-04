// Shared helpers for the settings UI. Centralizes small transforms that were
// previously duplicated across several settings components.

type ModelSelection = { providerID: string; modelID: string }

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
  if (index <= 0) return undefined
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
