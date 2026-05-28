import { describe, expect, test } from "bun:test"
import { normalizeCustomProviderID, providerOptions } from "../../../../src/cli/cmd/tui/component/dialog-provider"

describe("providerOptions", () => {
  // raccoon_change start - lock Raccoon as the default provider login
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
  // raccoon_change end

  test("includes a synthetic Other option for custom providers", () => {
    expect(providerOptions([{ id: "openai", name: "OpenAI" }]).at(-1)).toMatchObject({
      title: "Other",
      description: "Custom provider",
      category: "Providers",
    })
  })

  test("does not use Other as the generic provider category", () => {
    expect(providerOptions([{ id: "mistral", name: "Mistral" }])[0]?.category).toBe("Providers")
  })

  test("does not collide with a configured provider named other", () => {
    const values = providerOptions([{ id: "other", name: "Other Provider" }]).map((option) => option.value)
    expect(new Set(values).size).toBe(values.length)
  })

  test("normalizes and validates custom provider ids", () => {
    expect(normalizeCustomProviderID("  custom-provider  ")).toBe("custom-provider")
    expect(normalizeCustomProviderID("custom_provider")).toBe("custom_provider")
    expect(normalizeCustomProviderID("@ai-sdk/custom-provider")).toBe("custom-provider")
    expect(normalizeCustomProviderID("-custom-provider")).toBeUndefined()
    expect(normalizeCustomProviderID("Custom Provider")).toBeUndefined()
  })
})
