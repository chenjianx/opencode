import type { RaccoonMessagePart } from "../../../protocol"

export function filename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

export function shortValue(value: unknown) {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (value === null || value === undefined) return ""
  return JSON.stringify(value)
}

export function preview(value: string, length = 420) {
  const text = value.trim()
  if (text.length <= length) return text
  return `${text.slice(0, length)}...`
}

export function stripAnsi(value: string) {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
}

export function firstString(input: Record<string, unknown> | undefined, keys: string[]) {
  return keys.map((key) => input?.[key]).find((value): value is string => typeof value === "string" && value.trim().length > 0)
}

export function inputLines(part: RaccoonMessagePart, omitDiffInputs = false) {
  const hidden = omitDiffInputs ? new Set(["patchText", "oldString", "newString", "diff", "patch", "content", "before", "after"]) : undefined
  return Object.entries(part.input ?? {})
    .filter(([key]) => !hidden?.has(key))
    .map(([key, value]) => {
      const text = shortValue(value)
      if (!text) return
      return { key, value: preview(text, 180) }
    })
    .filter((item): item is { key: string; value: string } => !!item)
}

export function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  return value as Record<string, unknown>
}

export function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined
}

export function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}
