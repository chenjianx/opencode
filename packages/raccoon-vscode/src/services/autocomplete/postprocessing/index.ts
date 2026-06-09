import { lineIsRepeated } from "../filtering/streamTransforms/textSimilarity.js"
import { longestCommonSubsequence } from "./lcs.js"
import { removePrefixOverlap } from "./removePrefixOverlap.js"

function rewritesLineAbove(completion: string, prefix: string): boolean {
  const lineAbove = prefix
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .slice(-1)[0]
  if (!lineAbove) {
    return false
  }

  const firstLineOfCompletion = completion.split("\n").find((line) => line.trim().length > 0)
  if (!firstLineOfCompletion) {
    return false
  }
  return lineIsRepeated(lineAbove, firstLineOfCompletion)
}

const MAX_REPETITION_FREQ_TO_CHECK = 3
function isExtremeRepetition(completion: string): boolean {
  const lines = completion.split("\n")
  if (lines.length < 6) {
    return false
  }
  for (let freq = 1; freq < MAX_REPETITION_FREQ_TO_CHECK; freq++) {
    const lcs = longestCommonSubsequence(lines[0]!, lines[freq]!)
    if (lcs.length > 5 || lcs.length > lines[0]!.length * 0.5) {
      let matchCount = 0
      for (let i = 0; i < lines.length; i += freq) {
        if (lines[i]!.includes(lcs)) {
          matchCount++
        }
      }
      if (matchCount * freq > 8 || (matchCount * freq) / lines.length > 0.8) {
        return true
      }
    }
  }
  return false
}

function isOnlyWhitespace(completion: string): boolean {
  return /^[\s]+$/.test(completion)
}

function isBlank(completion: string): boolean {
  return completion.trim().length === 0
}

/**
 * Removes markdown code block delimiters from the completion: the first line if
 * it opens a fence, the last line if it is only backticks.
 */
function removeBackticks(completion: string): string {
  const lines = completion.split("\n")
  if (lines.length === 0) {
    return completion
  }

  let startIdx = 0
  let endIdx = lines.length

  if (lines[0]!.trim().startsWith("```")) {
    startIdx = 1
  }

  if (lines.length > startIdx) {
    const lastLineTrimmed = lines[lines.length - 1]!.trim()
    if (lastLineTrimmed.length > 0 && /^`+$/.test(lastLineTrimmed)) {
      endIdx = lines.length - 1
    }
  }

  if (startIdx > 0 || endIdx < lines.length) {
    return lines.slice(startIdx, endIdx).join("\n")
  }
  return completion
}

/**
 * Detects suggestions ending in a dangling member-access operator — e.g.
 * `System.`, `foo.bar.`, or `System.)` — which would insert syntactically
 * broken code. Raccoon-specific guard (continue-rac doesn't catch this).
 */
function endsWithDanglingMemberAccess(suggestion: string): boolean {
  const core = suggestion.replace(/[\s)\]};,]+$/, "")
  if (!core.endsWith(".")) return false
  if (core.endsWith("..")) return false // spread / rest / ellipsis
  const charBeforeDot = core[core.length - 2]
  if (charBeforeDot === undefined) return false
  return /[A-Za-z0-9_$)\]]/.test(charBeforeDot)
}

/**
 * Detects suggestions trailing off mid-expression on a dangling binary operator
 * — e.g. `i <` or `a &&`. Conservative: spares generics, arrows, increments,
 * and arithmetic. Raccoon-specific guard.
 */
function endsWithDanglingOperator(suggestion: string): boolean {
  const trimmed = suggestion.replace(/\s+$/, "")
  if (/(?:&&|\|\||===|!==|==|!=|<=|>=)$/.test(trimmed)) return true
  if (/\s[<>]$/.test(trimmed)) return true
  return false
}

/**
 * Final post-processing applied after the streaming transform pipeline. Ported
 * from continue-rac (core/autocomplete/postprocessing/index.ts), plus two
 * raccoon-specific guards for completions that trail off mid-expression.
 *
 * @returns the cleaned completion, or undefined if it should be filtered out
 */
export function postprocessCompletion({
  completion,
  model,
  prefix,
  suffix,
}: {
  completion: string
  model: string
  prefix: string
  suffix: string
}): string | undefined {
  if (isBlank(completion)) return undefined
  if (isOnlyWhitespace(completion)) return undefined
  if (rewritesLineAbove(completion, prefix)) return undefined
  if (isExtremeRepetition(completion)) return undefined

  if (model.includes("codestral")) {
    if (completion[0] === " " && completion[1] !== " ") {
      if (prefix.endsWith(" ") && suffix.startsWith("\n")) {
        completion = completion.slice(1)
      }
    }
    if (suffix.length === 0 && prefix.endsWith("\n\n") && completion.startsWith("\n")) {
      completion = completion.slice(1)
    }
  }

  if (model.includes("mercury")) {
    completion = removePrefixOverlap(completion, prefix)
    if (
      (completion.startsWith("  ") || completion.startsWith("\t")) &&
      !prefix.endsWith("\n") &&
      (suffix.startsWith("\n") || suffix.trim().length === 0)
    ) {
      completion = "\n" + completion
    }
  }

  if (prefix.endsWith(" ") && completion.startsWith(" ")) {
    completion = completion.slice(1)
  }

  completion = removeBackticks(completion)

  if (completion.trim().length === 0) return undefined
  if (endsWithDanglingMemberAccess(completion) || endsWithDanglingOperator(completion)) {
    return undefined
  }

  return completion
}
