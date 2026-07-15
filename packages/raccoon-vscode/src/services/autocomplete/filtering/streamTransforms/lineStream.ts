/**
 * Line-level stream transforms, ported from continue-rac
 * (core/autocomplete/filtering/streamTransforms/lineStream.ts). Only the
 * functions used by StreamTransformPipeline are included.
 */
import { lineIsRepeated } from "./textSimilarity.js"

type LineStream = AsyncGenerator<string>

const BRACKET_ENDING_CHARS = [")", "]", "}", ";"]
const PREFIXES_TO_SKIP = ["<COMPLETION>"]
const LINES_TO_STOP_AT = ["# End of file.", "<STOP EDITING HERE"]

function isBracketEnding(line: string): boolean {
  return line
    .trim()
    .split("")
    .some((char) => BRACKET_ENDING_CHARS.includes(char))
}

export async function* avoidPathLine(stream: LineStream, comment?: string): LineStream {
  // Snippets are inserted as comments with a line at the start '// Path: <PATH>'.
  for await (const line of stream) {
    if (comment && line.startsWith(`${comment} Path: `)) {
      continue
    }
    yield line
  }
}

export async function* avoidEmptyComments(stream: LineStream, comment?: string): LineStream {
  for await (const line of stream) {
    if (!comment || line.trim() !== comment) {
      yield line
    }
  }
}

export async function* streamWithNewLines(stream: LineStream): LineStream {
  let firstLine = true
  for await (const nextLine of stream) {
    if (!firstLine) {
      yield "\n"
    }
    firstLine = false
    yield nextLine
  }
}

export async function* stopAtSimilarLine(
  stream: LineStream,
  line: string,
  fullStop: () => void,
): AsyncGenerator<string> {
  const trimmedLine = line.trim()
  const lineIsBracketEnding = isBracketEnding(trimmedLine)

  for await (const nextLine of stream) {
    if (trimmedLine === "") {
      yield nextLine
      continue
    }

    if (lineIsBracketEnding && trimmedLine.trim() === nextLine.trim()) {
      yield nextLine
      continue
    }

    if (nextLine === line) {
      fullStop()
      break
    }

    if (lineIsRepeated(nextLine, trimmedLine)) {
      fullStop()
      break
    }

    yield nextLine
  }
}

export async function* stopAtLines(
  stream: LineStream,
  fullStop: () => void,
  linesToStopAt: string[] = LINES_TO_STOP_AT,
): LineStream {
  for await (const line of stream) {
    if (linesToStopAt.some((stopAt) => line.trim().includes(stopAt))) {
      fullStop()
      break
    }
    yield line
  }
}

export async function* stopAtLinesExact(
  stream: LineStream,
  fullStop: () => void,
  linesToStopAt: string[],
): LineStream {
  for await (const line of stream) {
    if (linesToStopAt.some((stopAt) => line === stopAt)) {
      fullStop()
      break
    }
    yield line
  }
}

export async function* skipPrefixes(lines: LineStream): LineStream {
  let isFirstLine = true
  for await (const line of lines) {
    if (isFirstLine) {
      const match = PREFIXES_TO_SKIP.find((prefix) => line.startsWith(prefix))
      if (match) {
        yield line.slice(match.length)
        continue
      }
      isFirstLine = false
    }
    yield line
  }
}

export async function* stopAtRepeatingLines(lines: LineStream, fullStop: () => void): LineStream {
  let previousLine: string | undefined
  let repeatCount = 0
  const MAX_REPEATS = 3

  for await (const line of lines) {
    if (line === previousLine) {
      repeatCount++
      if (repeatCount === MAX_REPEATS) {
        fullStop()
        return
      }
    } else {
      yield line
      repeatCount = 1
    }
    previousLine = line
  }
}

export async function* showWhateverWeHaveAtXMs(lines: LineStream, ms: number): LineStream {
  const startTime = Date.now()
  let firstNonWhitespaceLineYielded = false

  for await (const line of lines) {
    yield line

    if (!firstNonWhitespaceLineYielded && line.trim() !== "") {
      firstNonWhitespaceLineYielded = true
    }

    const isTakingTooLong = Date.now() - startTime > ms
    if (isTakingTooLong && firstNonWhitespaceLineYielded) {
      break
    }
  }
}

export async function* noDoubleNewLine(lines: LineStream): LineStream {
  let isFirstLine = true

  for await (const line of lines) {
    if (line.trim() === "" && !isFirstLine) {
      return
    }

    isFirstLine = false

    yield line
  }
}
