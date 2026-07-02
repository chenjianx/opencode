import { beforeAll, describe, expect, mock, test } from "bun:test"
import type { RaccoonModel } from "@opencode-ai/raccoon-webview"
import type { RaccoonProviderConfig as RaccoonProviderConfigType } from "./provider-config"

let RaccoonProviderConfig: typeof RaccoonProviderConfigType

beforeAll(async () => {
  mock.module("vscode", () => ({}))
  RaccoonProviderConfig = (await import("./provider-config")).RaccoonProviderConfig
})

function model(providerID: string, modelID: string, enabled = true): RaccoonModel {
  return {
    providerID,
    providerName: providerID,
    modelID,
    modelName: modelID,
    enabled,
    connected: true,
  }
}

describe("RaccoonProviderConfig", () => {
  test("prefers the saved selected model before config defaults", () => {
    const config = new RaccoonProviderConfig({
      client: async () => {
        throw new Error("not used")
      },
      directory: () => "/workspace",
      getState: () => ({
        selectedModel: { providerID: "openai", modelID: "gpt-5" },
        mode: "build",
      } as never),
      setState: () => {},
      post: () => {},
      refresh: async () => {},
      withLoading: async (run) => await run(),
      webviewHost: { post: () => {}, postState: () => {}, postError: () => {}, postRaccoonLoginFinished: () => {}, postCustomProviderSaved: () => {} } as never,
    })

    expect(
      config.selectModel(
        [model("openai", "gpt-5"), model("raccoon", "big-pickle")],
        { raccoon: "big-pickle" },
      ),
    ).toEqual({ providerID: "openai", modelID: "gpt-5" })
  })

  test("falls back to config defaults when saved selected model is unavailable", () => {
    const config = new RaccoonProviderConfig({
      client: async () => {
        throw new Error("not used")
      },
      directory: () => "/workspace",
      getState: () => ({
        selectedModel: { providerID: "openai", modelID: "missing" },
        mode: "build",
      } as never),
      setState: () => {},
      post: () => {},
      refresh: async () => {},
      withLoading: async (run) => await run(),
      webviewHost: { post: () => {}, postState: () => {}, postError: () => {}, postRaccoonLoginFinished: () => {}, postCustomProviderSaved: () => {} } as never,
    })

    expect(
      config.selectModel(
        [model("openai", "gpt-5"), model("raccoon", "big-pickle")],
        { raccoon: "big-pickle" },
      ),
    ).toEqual({ providerID: "raccoon", modelID: "big-pickle" })
  })
})
