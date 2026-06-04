import { describe, expect, test } from "bun:test"
import { providerOptions } from "../../src/cli/cmd/tui/component/dialog-provider"

// raccoon_change - tests for raccoon provider branding (src/raccoon/branding.ts),
// kept out of the upstream provider-options test to minimize merge conflicts.

describe("raccoon provider branding", () => {
  test("prioritizes Raccoon as the default provider", () => {
    expect(
      providerOptions([
        { id: "openai", name: "OpenAI" },
        { id: "raccoon", name: "Raccoon" },
        { id: "opencode", name: "opencode" },
      ])[0],
    ).toMatchObject({
      value: "raccoon",
      description: "(Recommended)",
    })
  })

  test("keeps Raccoon in the Popular category", () => {
    const raccoon = providerOptions([{ id: "raccoon", name: "Raccoon" }]).find((o) => o.value === "raccoon")
    expect(raccoon?.category).toBe("Popular")
  })
})
