import {
  type AutocompleteLanguageInfo,
  languageForFilepath,
} from "../constants/AutocompleteLanguageInfo.js"
import { countTokens, pruneLinesFromBottom, pruneLinesFromTop } from "./tokens.js"
import type { AutocompleteInput, AutocompleteOptions } from "./types.js"

/**
 * Derived values shared across the autocomplete pipeline. Ported from
 * continue-rac (core/autocomplete/util/HelperVars.ts), but stripped of the IDE
 * and tree-sitter AST dependencies: file contents come straight from the
 * document and prefix/suffix are split at the cursor offset.
 */
export class HelperVars {
  lang: AutocompleteLanguageInfo

  readonly fileContents: string
  readonly fileLines: string[]
  readonly fullPrefix: string
  readonly fullSuffix: string
  readonly prunedPrefix: string
  readonly prunedSuffix: string

  constructor(
    public readonly input: AutocompleteInput,
    public readonly options: AutocompleteOptions,
    public readonly modelName: string,
  ) {
    this.lang = languageForFilepath(input.filepath)
    this.fileContents = input.fileContents
    this.fileLines = this.fileContents.split("\n")

    const offset = this.offsetAt(input.pos)
    this.fullPrefix = this.fileContents.slice(0, offset)
    this.fullSuffix = this.fileContents.slice(offset)

    const { prunedPrefix, prunedSuffix } = this.prunePrefixSuffix()
    this.prunedPrefix = prunedPrefix
    this.prunedSuffix = prunedSuffix
  }

  /** Convert a {line, character} position into a character offset. */
  private offsetAt(pos: { line: number; character: number }): number {
    let offset = 0
    for (let i = 0; i < pos.line && i < this.fileLines.length; i++) {
      offset += this.fileLines[i]!.length + 1 // +1 for the newline
    }
    return offset + pos.character
  }

  private prunePrefixSuffix() {
    const maxPrefixTokens = this.options.maxPromptTokens * this.options.prefixPercentage
    const prunedPrefix = pruneLinesFromTop(this.fullPrefix, maxPrefixTokens)

    const maxSuffixTokens = Math.min(
      this.options.maxPromptTokens - countTokens(prunedPrefix),
      this.options.maxSuffixPercentage * this.options.maxPromptTokens,
    )
    const prunedSuffix = pruneLinesFromBottom(this.fullSuffix, maxSuffixTokens)

    return { prunedPrefix, prunedSuffix }
  }

  get filepath(): string {
    return this.input.filepath
  }
  get pos() {
    return this.input.pos
  }
}
