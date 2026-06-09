/** Levenshtein edit distance (iterative two-row), inlined to avoid an npm dep. */
function distance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  let curr = new Array<number>(b.length + 1)
  for (let i = 0; i < a.length; i++) {
    curr[0] = i + 1
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1
      curr[j + 1] = Math.min(curr[j]! + 1, prev[j + 1]! + 1, prev[j]! + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]!
}

/**
 * Determine if two lines are effectively the same/repetition.
 * Short lines (<=4 chars) are never considered repeated.
 */
export function lineIsRepeated(a: string, b: string): boolean {
  if (a.length <= 4 || b.length <= 4) {
    return false
  }
  const aTrim = a.trim()
  const bTrim = b.trim()
  if (bTrim.length === 0) return false
  return distance(aTrim, bTrim) / bTrim.length < 0.1
}
