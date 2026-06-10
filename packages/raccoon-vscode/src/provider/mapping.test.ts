import { describe, expect, test } from "bun:test"
import { mapProviderModels } from "./mapping"

describe("mapProviderModels", () => {
  test("filters autocomplete-only raccoon models from selectable models", () => {
    const models = mapProviderModels(
      {
        id: "raccoon",
        name: "Raccoon",
        source: "config",
        models: {
          "raccoon-pro-completion": {
            id: "raccoon-pro-completion",
            name: "Raccoon Complete Pro",
          },
          "raccoon-completion": {
            id: "raccoon-completion",
            name: "Raccoon Complete",
          },
          "raccoon-chat": {
            id: "raccoon-chat",
            name: "Raccoon Chat",
          },
        },
      } as never,
      true,
      new Set(),
    )

    expect(models.map((model) => model.modelID)).toEqual(["raccoon-chat"])
  })
})
