/**
 * Lightweight token utilities. The reference (continue-rac) uses tiktoken; here
 * we approximate ~4 chars per token, which is accurate enough for prefix/suffix
 * budget pruning (it only shifts the truncation boundary by a few lines).
 */

const CHARS_PER_TOKEN = 4

export function countTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/** Drop whole lines from the top until the text fits within `maxTokens`. */
export function pruneLinesFromTop(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return ""
  const lines = text.split("\n")
  while (lines.length > 1 && countTokens(lines.join("\n")) > maxTokens) {
    lines.shift()
  }
  return lines.join("\n")
}

/** Drop whole lines from the bottom until the text fits within `maxTokens`. */
export function pruneLinesFromBottom(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return ""
  const lines = text.split("\n")
  while (lines.length > 1 && countTokens(lines.join("\n")) > maxTokens) {
    lines.pop()
  }
  return lines.join("\n")
}
