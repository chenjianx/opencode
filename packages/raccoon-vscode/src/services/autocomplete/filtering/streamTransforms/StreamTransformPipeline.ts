import type { HelperVars } from "../../util/HelperVars.js"
import type { BracketMatchingService } from "../BracketMatchingService.js"
import { stopAtStartOf, stopAtStopTokens } from "./charStream.js"
import {
  avoidEmptyComments,
  avoidPathLine,
  noDoubleNewLine,
  showWhateverWeHaveAtXMs,
  skipPrefixes,
  stopAtLines,
  stopAtLinesExact,
  stopAtRepeatingLines,
  stopAtSimilarLine,
  streamWithNewLines,
} from "./lineStream.js"
import { streamLines } from "./streamLines.js"

const STOP_AT_PATTERNS = ["diff --git"]

/**
 * Streaming filter pipeline, ported from continue-rac
 * (core/autocomplete/filtering/streamTransforms/StreamTransformPipeline.ts).
 * Language-specific char/line filters are omitted (none in this variant); the
 * bracket-matching service is applied as the char-level filter instead.
 */
export class StreamTransformPipeline {
  constructor(private readonly bracketMatching: BracketMatchingService) {}

  async *transform(
    generator: AsyncGenerator<string>,
    prefix: string,
    suffix: string,
    multiline: boolean,
    stopTokens: string[],
    fullStop: () => void,
    helper: HelperVars,
  ): AsyncGenerator<string> {
    let charGenerator = generator

    charGenerator = stopAtStopTokens(charGenerator, [...stopTokens, ...STOP_AT_PATTERNS])
    charGenerator = stopAtStartOf(charGenerator, suffix)
    charGenerator = this.bracketMatching.stopOnUnmatchedClosingBracket(
      charGenerator,
      prefix,
      suffix,
      helper.filepath,
      multiline,
    )

    let lineGenerator = streamLines(charGenerator)

    lineGenerator = stopAtLines(lineGenerator, fullStop)
    const lineBelowCursor = this.getLineBelowCursor(helper)
    if (lineBelowCursor.trim() !== "") {
      lineGenerator = stopAtLinesExact(lineGenerator, fullStop, [lineBelowCursor])
    }
    lineGenerator = stopAtRepeatingLines(lineGenerator, fullStop)
    lineGenerator = avoidEmptyComments(lineGenerator, helper.lang.singleLineComment)
    lineGenerator = avoidPathLine(lineGenerator, helper.lang.singleLineComment)
    lineGenerator = skipPrefixes(lineGenerator)
    lineGenerator = noDoubleNewLine(lineGenerator)

    lineGenerator = stopAtSimilarLine(lineGenerator, lineBelowCursor, fullStop)

    // Progressive-render timeout. We render the completion in one batch (await
    // the whole stream, then show), so cutting the stream short here only
    // truncates normal multi-line completions. Disabled by default
    // (showWhateverWeHaveAtXMs = 0); enable it only for incremental rendering.
    if (helper.options.showWhateverWeHaveAtXMs > 0) {
      lineGenerator = showWhateverWeHaveAtXMs(lineGenerator, helper.options.showWhateverWeHaveAtXMs)
    }

    const finalGenerator = streamWithNewLines(lineGenerator)
    for await (const update of finalGenerator) {
      yield update
    }
  }

  private getLineBelowCursor(helper: HelperVars): string {
    let lineBelowCursor = ""
    let i = 1
    while (lineBelowCursor.trim() === "" && helper.pos.line + i <= helper.fileLines.length - 1) {
      lineBelowCursor = helper.fileLines[Math.min(helper.pos.line + i, helper.fileLines.length - 1)]!
      i++
    }
    return lineBelowCursor
  }
}
