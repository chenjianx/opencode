/**
 * Bracket matching for completions, ported from continue-rac
 * (core/autocomplete/filtering/BracketMatchingService.ts).
 */

const BRACKETS: { [key: string]: string } = {
  "(": ")",
  "{": "}",
  "[": "]",
}
const BRACKETS_REVERSE: { [key: string]: string } = {
  ")": "(",
  "}": "{",
  "]": "[",
}

/** Scan a text fragment, maintaining a bracket stack. Stops at the first
 *  unmatched closing bracket (leaving the stack at the point of the break). */
function scanBracketBalance(text: string, stack: string[] = []): string[] {
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (Object.keys(BRACKETS).includes(char)) {
      stack.push(char)
    } else if (Object.values(BRACKETS).includes(char)) {
      if (stack.length === 0 || BRACKETS[stack.pop()!] !== char) {
        break
      }
    }
  }
  return stack
}

export class BracketMatchingService {
  private openingBracketsFromLastCompletion: string[] = []
  private lastCompletionFile: string | undefined = undefined

  handleAcceptedCompletion(completion: string, filepath: string) {
    this.openingBracketsFromLastCompletion = scanBracketBalance(completion)
    this.lastCompletionFile = filepath
  }

  async *stopOnUnmatchedClosingBracket(
    stream: AsyncGenerator<string>,
    prefix: string,
    suffix: string,
    filepath: string,
    multiline: boolean,
  ): AsyncGenerator<string> {
    let stack: string[] = []
    if (multiline) {
      if (this.lastCompletionFile === filepath) {
        stack = [...this.openingBracketsFromLastCompletion]
      } else {
        this.lastCompletionFile = undefined
      }
    } else {
      const currentLine = (prefix.split("\n").pop() ?? "") + (suffix.split("\n")[0] ?? "")
      stack = scanBracketBalance(currentLine)
    }

    // Add corresponding open brackets from suffix to stack
    for (let i = 0; i < suffix.length; i++) {
      if (suffix[i] === " ") {
        continue
      }
      const openBracket = BRACKETS_REVERSE[suffix[i]!]
      if (!openBracket) {
        break
      }
      stack.unshift(openBracket)
    }

    let seenNonWhitespaceOrClosingBracket = false
    for await (let chunk of stream) {
      // Allow closing brackets before any non-whitespace characters
      if (!seenNonWhitespaceOrClosingBracket) {
        const firstNonWhitespaceOrClosingBracketIndex = chunk.search(/[^\s)}\]]/)
        if (firstNonWhitespaceOrClosingBracketIndex !== -1) {
          yield chunk.slice(0, firstNonWhitespaceOrClosingBracketIndex)
          chunk = chunk.slice(firstNonWhitespaceOrClosingBracketIndex)
          seenNonWhitespaceOrClosingBracket = true
        } else {
          yield chunk
          continue
        }
      }

      for (let i = 0; i < chunk.length; i++) {
        const char = chunk[i]!
        if (Object.values(BRACKETS).includes(char)) {
          if (stack.length === 0 || BRACKETS[stack.pop()!] !== char) {
            yield chunk.slice(0, i)
            return
          }
        } else if (Object.keys(BRACKETS).includes(char)) {
          stack.push(char)
        }
      }
      yield chunk
    }
  }
}
