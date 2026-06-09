/**
 * Bracket matching for completions, ported from continue-rac
 * (core/autocomplete/filtering/BracketMatchingService.ts).
 */

export const BRACKETS: { [key: string]: string } = {
  "(": ")",
  "{": "}",
  "[": "]",
}
export const BRACKETS_REVERSE: { [key: string]: string } = {
  ")": "(",
  "}": "{",
  "]": "[",
}

export class BracketMatchingService {
  private openingBracketsFromLastCompletion: string[] = []
  private lastCompletionFile: string | undefined = undefined

  handleAcceptedCompletion(completion: string, filepath: string) {
    this.openingBracketsFromLastCompletion = []
    const stack: string[] = []

    for (let i = 0; i < completion.length; i++) {
      const char = completion[i]!
      if (Object.keys(BRACKETS).includes(char)) {
        stack.push(char)
      } else if (Object.values(BRACKETS).includes(char)) {
        if (stack.length === 0 || BRACKETS[stack.pop()!] !== char) {
          break
        }
      }
    }

    this.openingBracketsFromLastCompletion = stack
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
      for (let i = 0; i < currentLine.length; i++) {
        const char = currentLine[i]!
        if (Object.keys(BRACKETS).includes(char)) {
          stack.push(char)
        } else if (Object.values(BRACKETS).includes(char)) {
          if (stack.length === 0 || BRACKETS[stack.pop()!] !== char) {
            break
          }
        }
      }
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
