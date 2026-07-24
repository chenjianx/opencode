import { describe, expect, test } from "bun:test"
import { AutocompleteDebouncer } from "./AutocompleteDebouncer"

describe("AutocompleteDebouncer", () => {
  test(
    "resolves superseded requests instead of leaving them pending",
    async () => {
      const debouncer = new AutocompleteDebouncer()
      const superseded = debouncer.delayAndShouldDebounce(10_000)
      const latest = debouncer.delayAndShouldDebounce(0)

      expect(await superseded).toBe(true)
      expect(await latest).toBe(false)
    },
    100,
  )
})
