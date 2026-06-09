import { describe, expect, test } from "bun:test"
import { HelperVars } from "./HelperVars"
import { DEFAULT_AUTOCOMPLETE_OPTIONS, type AutocompleteInput } from "./types"

function makeInput(fileContents: string, line: number, character: number): AutocompleteInput {
  return {
    completionId: "1",
    filepath: "/tmp/test.ts",
    languageId: "typescript",
    pos: { line, character },
    fileContents,
    isUntitledFile: false,
  }
}

describe("HelperVars", () => {
  test("splits prefix/suffix at the cursor offset", () => {
    const contents = "const a = 1\nconst b = 2\n"
    // cursor right after "const b" on line 1
    const helper = new HelperVars(makeInput(contents, 1, 7), DEFAULT_AUTOCOMPLETE_OPTIONS, "raccoon-pro-completion")
    expect(helper.fullPrefix).toBe("const a = 1\nconst b")
    expect(helper.fullSuffix).toBe(" = 2\n")
  })

  test("prunes a very long prefix from the top by token budget", () => {
    const longLines = Array.from({ length: 5000 }, (_, i) => `const v${i} = ${i};`).join("\n")
    const helper = new HelperVars(
      makeInput(longLines, 4999, 0),
      DEFAULT_AUTOCOMPLETE_OPTIONS,
      "raccoon-pro-completion",
    )
    // pruned prefix should be much shorter than the full prefix
    expect(helper.prunedPrefix.length).toBeLessThan(helper.fullPrefix.length)
    // and bounded by the prefix token budget (~768 * 0.3 tokens * 4 chars)
    expect(helper.prunedPrefix.length).toBeLessThanOrEqual(768 * 0.3 * 4 + 200)
  })
})
