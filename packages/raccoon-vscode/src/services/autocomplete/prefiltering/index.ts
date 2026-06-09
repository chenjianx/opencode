import type { HelperVars } from "../util/HelperVars.js"

/**
 * Returns true when the cursor sits inside an identifier (the char right after
 * the cursor is a word char, e.g. `fo|o`). A fresh request there would fight the
 * user's typing. Folded in from the old contextualSkip module.
 */
function isMidWordTyping(suffix: string): boolean {
  return /^[a-zA-Z0-9_]/.test(suffix)
}

/**
 * Decide whether to skip this completion request before doing any work. Ported
 * from continue-rac (core/autocomplete/prefiltering/index.ts), trimmed to the
 * cases relevant to the prefix/suffix pipeline.
 */
export function shouldPrefilter(helper: HelperVars): boolean {
  if (helper.options.disable) {
    return true
  }

  // No information to work with (untitled and empty).
  if (helper.input.isUntitledFile && helper.fileContents.trim() === "") {
    return true
  }

  // Mid-word typing: let the cache / generator-reuse serve instead.
  if (isMidWordTyping(helper.fullSuffix)) {
    return true
  }

  return false
}
