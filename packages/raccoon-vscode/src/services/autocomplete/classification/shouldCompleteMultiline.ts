import type { AutocompleteLanguageInfo } from "../constants/AutocompleteLanguageInfo.js"
import type { HelperVars } from "../util/HelperVars.js"

function shouldCompleteMultilineBasedOnLanguage(
  language: AutocompleteLanguageInfo,
  prefix: string,
  suffix: string,
): boolean {
  return language.useMultiline?.({ prefix, suffix }) ?? true
}

/**
 * Decide single-line vs multi-line completion. Ported from continue-rac
 * (core/autocomplete/classification/shouldCompleteMultiline.ts), minus the
 * AST-based branch.
 */
export function shouldCompleteMultiline(helper: HelperVars): boolean {
  switch (helper.options.multilineCompletions) {
    case "always":
      return true
    case "never":
      return false
    default:
      break
  }

  // Always single-line if an intellisense option is selected.
  if (helper.input.selectedCompletionInfo) {
    return true
  }

  // Don't complete multi-line for single-line comments.
  const lastLine = helper.fullPrefix.split("\n").slice(-1)[0]?.trimStart()
  if (helper.lang.singleLineComment && lastLine?.startsWith(helper.lang.singleLineComment)) {
    return false
  }

  return shouldCompleteMultilineBasedOnLanguage(helper.lang, helper.prunedPrefix, helper.prunedSuffix)
}
