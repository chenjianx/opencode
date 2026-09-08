import type { RaccoonMessage, RaccoonMessagePart, RaccoonMessageTokens } from "../../../protocol"

const PATH_INPUT_KEYS = new Set(["filePath", "filepath", "file", "target_file", "path", "directory", "cwd"])

export function isPathInputKey(key: string) {
  return PATH_INPUT_KEYS.has(key)
}

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
      return { key, value: isPathInputKey(key) ? text : preview(text, 180) }
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

// Total tokens consumed by a single assistant turn. Prefer the provider-reported
// `total`; otherwise sum the individual buckets.
export function messageTokenTotal(tokens: RaccoonMessageTokens) {
  if (typeof tokens.total === "number" && tokens.total > 0) return tokens.total
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
}

// Sum token usage and cost across the assistant messages of a session.
export function sessionUsage(messages: RaccoonMessage[]) {
  return messages.reduce(
    (sum, message) => ({
      input: sum.input + (message.tokens?.input ?? 0),
      output: sum.output + (message.tokens?.output ?? 0),
      cacheRead: sum.cacheRead + (message.tokens?.cache.read ?? 0),
      cacheWrite: sum.cacheWrite + (message.tokens?.cache.write ?? 0),
      total: sum.total + (message.tokens ? messageTokenTotal(message.tokens) : 0),
      cost: sum.cost + (message.cost ?? 0),
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0 },
  )
}

// Tokens occupying the model's context window right now — the most recent assistant
// turn's footprint (prompt + cache + reasoning + output). Used to gauge how full the
// context window is, independent of the cumulative session totals.
export function contextTokens(messages: RaccoonMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.role === "assistant" && message.tokens) return messageTokenTotal(message.tokens)
  }
  return 0
}

// Per-type token footprint of the current context window — the most recent
// assistant turn, split into the buckets we surface (input/cache/reasoning/output).
// `total` matches contextTokens() so the ring percentage and the breakdown agree.
export function contextBreakdown(messages: RaccoonMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.role === "assistant" && message.tokens) {
      const tokens = message.tokens
      return {
        input: tokens.input,
        output: tokens.output,
        reasoning: tokens.reasoning,
        cache: tokens.cache.read + tokens.cache.write,
        total: messageTokenTotal(tokens),
      }
    }
  }
  return { input: 0, output: 0, reasoning: 0, cache: 0, total: 0 }
}

// Compact token count, e.g. 950, 12.3K, 1.2M.
export function formatTokens(value: number) {
  if (value < 1000) return String(value)
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}K`
  return `${(value / 1_000_000).toFixed(1)}M`
}

// Cost in dollars, e.g. $0.0123. Returns empty string when there is nothing to show.
export function formatCost(value: number) {
  if (!value) return ""
  return `$${value < 0.01 ? value.toFixed(4) : value.toFixed(2)}`
}

export function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}
