import { beforeAll, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { RaccoonModel } from "@opencode-ai/raccoon-webview"
import type { RaccoonProviderConfig as RaccoonProviderConfigType } from "./provider-config"

let RaccoonProviderConfig: typeof RaccoonProviderConfigType

beforeAll(async () => {
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
      getState: () =>
        ({
          selectedModel: { providerID: "openai", modelID: "gpt-5" },
          mode: "build",
        }) as never,
      setState: () => {},
      post: () => {},
      refresh: async () => {},
      withLoading: async (run) => await run(),
      webviewHost: {
        post: () => {},
        postState: () => {},
        postError: () => {},
        postRaccoonLoginFinished: () => {},
        postCustomProviderSaved: () => {},
      } as never,
    })

    expect(
      config.selectModel([model("openai", "gpt-5"), model("raccoon", "big-pickle")], { raccoon: "big-pickle" }),
    ).toEqual({ providerID: "openai", modelID: "gpt-5" })
  })

  test("falls back to config defaults when saved selected model is unavailable", () => {
    const config = new RaccoonProviderConfig({
      client: async () => {
        throw new Error("not used")
      },
      directory: () => "/workspace",
      getState: () =>
        ({
          selectedModel: { providerID: "openai", modelID: "missing" },
          mode: "build",
        }) as never,
      setState: () => {},
      post: () => {},
      refresh: async () => {},
      withLoading: async (run) => await run(),
      webviewHost: {
        post: () => {},
        postState: () => {},
        postError: () => {},
        postRaccoonLoginFinished: () => {},
        postCustomProviderSaved: () => {},
      } as never,
    })

    expect(
      config.selectModel([model("openai", "gpt-5"), model("raccoon", "big-pickle")], { raccoon: "big-pickle" }),
    ).toEqual({ providerID: "raccoon", modelID: "big-pickle" })
  })

  test("prefers raccoon when no model is configured (refresh/reload default)", () => {
    const config = new RaccoonProviderConfig({
      client: async () => {
        throw new Error("not used")
      },
      directory: () => "/workspace",
      getState: () => ({ mode: "build" }) as never,
      setState: () => {},
      post: () => {},
      refresh: async () => {},
      withLoading: async (run) => await run(),
      webviewHost: {
        post: () => {},
        postState: () => {},
        postError: () => {},
        postRaccoonLoginFinished: () => {},
        postCustomProviderSaved: () => {},
      } as never,
    })

    // openai is listed first and has a server default, but raccoon is logged in (connected),
    // so the unconfigured default must land on raccoon's server default.
    expect(
      config.resolveDefaultModel(
        [model("openai", "gpt-5"), model("raccoon", "raccoon-chat"), model("raccoon", "raccoon-pro-chat")],
        { openai: "gpt-5", raccoon: "raccoon-pro-chat" },
      ),
    ).toEqual({ providerID: "raccoon", modelID: "raccoon-pro-chat" })
  })

  test("uses first raccoon model when no raccoon server default is set", () => {
    const config = new RaccoonProviderConfig({
      client: async () => {
        throw new Error("not used")
      },
      directory: () => "/workspace",
      getState: () => ({ mode: "build" }) as never,
      setState: () => {},
      post: () => {},
      refresh: async () => {},
      withLoading: async (run) => await run(),
      webviewHost: {
        post: () => {},
        postState: () => {},
        postError: () => {},
        postRaccoonLoginFinished: () => {},
        postCustomProviderSaved: () => {},
      } as never,
    })

    expect(
      config.resolveDefaultModel([model("openai", "gpt-5"), model("raccoon", "raccoon-chat")], { openai: "gpt-5" }),
    ).toEqual({ providerID: "raccoon", modelID: "raccoon-chat" })
  })

  test("keeps a non-raccoon model the user explicitly selected across refresh", async () => {
    const config = new RaccoonProviderConfig({
      client: async () => {
        throw new Error("not used")
      },
      directory: () => "/workspace",
      getState: () => ({ mode: "build" }) as never,
      setState: () => {},
      post: () => {},
      refresh: async () => {},
      withLoading: async (run) => await run(),
      webviewHost: {
        post: () => {},
        postState: () => {},
        postError: () => {},
        postRaccoonLoginFinished: () => {},
        postCustomProviderSaved: () => {},
      } as never,
    })
    // Simulate a persisted explicit selection of a non-raccoon model.
    ;(config as unknown as { selectedModel?: { providerID: string; modelID: string } }).selectedModel = {
      providerID: "openai",
      modelID: "gpt-5",
    }

    expect(
      config.resolveDefaultModel([model("openai", "gpt-5"), model("raccoon", "raccoon-chat")], {
        raccoon: "raccoon-chat",
      }),
    ).toEqual({ providerID: "openai", modelID: "gpt-5" })
  })

  test("falls back to non-raccoon default when raccoon is not connected", () => {
    const config = new RaccoonProviderConfig({
      client: async () => {
        throw new Error("not used")
      },
      directory: () => "/workspace",
      getState: () => ({ mode: "build" }) as never,
      setState: () => {},
      post: () => {},
      refresh: async () => {},
      withLoading: async (run) => await run(),
      webviewHost: {
        post: () => {},
        postState: () => {},
        postError: () => {},
        postRaccoonLoginFinished: () => {},
        postCustomProviderSaved: () => {},
      } as never,
    })

    const raccoonDisconnected: RaccoonModel = { ...model("raccoon", "raccoon-chat"), connected: false }
    expect(config.resolveDefaultModel([model("openai", "gpt-5"), raccoonDisconnected], { openai: "gpt-5" })).toEqual({
      providerID: "openai",
      modelID: "gpt-5",
    })
  })

  test("keeps global-only agents scoped to user when merged config includes them", async () => {
    const dir = await mkdtemp(join(tmpdir(), "raccoon-agent-"))
    try {
      let state = { mode: "build" } as never
      const config = new RaccoonProviderConfig({
        client: async () => {
          throw new Error("not used")
        },
        directory: () => dir,
        getState: () => state,
        setState: (next) => {
          state = next as never
        },
        post: () => {},
        refresh: async () => {},
        withLoading: async (run) => await run(),
        webviewHost: {
          post: () => {},
          postState: () => {},
          postError: () => {},
          postRaccoonLoginFinished: () => {},
          postCustomProviderSaved: () => {},
        } as never,
        pluginLanguage: () => "en",
      })

      await config.loadModels({
        path: { get: async () => ({ data: {} }) },
        config: {
          providers: async () => ({ data: { default: {} } }),
          get: async () => ({ data: { agent: { "custom-agent-user": { mode: "subagent" } } } }),
        },
        global: {
          config: { get: async () => ({ data: { agent: { "custom-agent-user": { mode: "subagent" } } } }) },
        },
        provider: {
          list: async () => ({ data: { connected: [], all: [] } }),
          auth: async () => ({ data: {} }),
        },
        command: { list: async () => ({ data: [] }) },
        app: {
          agents: async () => ({
            data: [
              {
                name: "custom-agent-user",
                description: "",
                mode: "subagent",
                permission: [],
                options: {},
              },
            ],
          }),
        },
      } as never)

      expect((state as { agents: Array<{ name: string; configScope?: string }> }).agents[0]).toMatchObject({
        name: "custom-agent-user",
        configScope: "user",
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("project-scope agent config defaults to raccoon.jsonc in an empty project", async () => {
    const dir = await mkdtemp(join(tmpdir(), "raccoon-agent-"))
    try {
      let disposed = false
      let refreshed = false
      const client = {
        instance: {
          dispose: async () => {
            disposed = true
          },
        },
      }
      const config = new RaccoonProviderConfig({
        client: async () => client as never,
        directory: () => dir,
        getState: () => ({}) as never,
        setState: () => {},
        post: () => {},
        refresh: async () => {
          refreshed = true
        },
        withLoading: async (run) => await run(),
        webviewHost: {
          post: () => {},
          postState: () => {},
          postError: () => {},
          postRaccoonLoginFinished: () => {},
          postCustomProviderSaved: () => {},
        } as never,
      })

      await config.configureAgent({
        type: "configureAgent",
        requestID: "create-project-reviewer",
        scope: "project",
        agent: { name: "reviewer", description: "review code", mode: "subagent" },
      })

      const written = JSON.parse(await readFile(join(dir, "raccoon.jsonc"), "utf8"))
      expect(written.agent?.reviewer).toMatchObject({ description: "review code", mode: "subagent" })
      // The change must flush the instance cache and refresh the webview state.
      expect(disposed).toBe(true)
      expect(refreshed).toBe(true)
      // It must NOT write to the never-loaded project config.json.
      await expect(readFile(join(dir, "config.json"), "utf8")).rejects.toThrow()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("project-scope agent config merges into existing opencode.json and can delete", async () => {
    const dir = await mkdtemp(join(tmpdir(), "raccoon-agent-"))
    try {
      await writeFile(
        join(dir, "opencode.json"),
        JSON.stringify({ $schema: "x", model: "openai/gpt-5", agent: { keep: { mode: "primary" } } }),
      )
      const client = { instance: { dispose: async () => {} } }
      const config = new RaccoonProviderConfig({
        client: async () => client as never,
        directory: () => dir,
        getState: () => ({}) as never,
        setState: () => {},
        post: () => {},
        refresh: async () => {},
        withLoading: async (run) => await run(),
        webviewHost: {
          post: () => {},
          postState: () => {},
          postError: () => {},
          postRaccoonLoginFinished: () => {},
          postCustomProviderSaved: () => {},
        } as never,
      })

      await config.configureAgent({
        type: "configureAgent",
        requestID: "create-project-reviewer",
        scope: "project",
        agent: { name: "reviewer", mode: "subagent" },
      })

      let written = JSON.parse(await readFile(join(dir, "opencode.json"), "utf8"))
      // Existing top-level keys and sibling agents are preserved.
      expect(written.model).toBe("openai/gpt-5")
      expect(written.agent?.keep).toMatchObject({ mode: "primary" })
      expect(written.agent?.reviewer).toMatchObject({ mode: "subagent" })

      await config.deleteAgent("reviewer", "project")
      written = JSON.parse(await readFile(join(dir, "opencode.json"), "utf8"))
      expect(written.agent?.reviewer).toBeUndefined()
      expect(written.agent?.keep).toMatchObject({ mode: "primary" })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("user-scope delete removes the agent and invalidates the global cache", async () => {
    const dir = await mkdtemp(join(tmpdir(), "raccoon-agent-"))
    const globalDir = await mkdtemp(join(tmpdir(), "raccoon-global-"))
    try {
      // Existing user-scope agent on disk in the global config file.
      await writeFile(
        join(globalDir, "opencode.json"),
        JSON.stringify({ agent: { mine: { mode: "subagent", description: "x" }, other: { mode: "all" } } }),
      )
      const globalUpdates: unknown[] = []
      let globalDisposed = false
      const client = {
        instance: { dispose: async () => {} },
        path: { get: async () => ({ data: { config: globalDir } }) },
        global: {
          config: {
            update: async (body: unknown) => {
              globalUpdates.push(body)
            },
          },
          dispose: async () => {
            globalDisposed = true
          },
        },
      }
      const config = new RaccoonProviderConfig({
        client: async () => client as never,
        directory: () => dir,
        getState: () => ({}) as never,
        setState: () => {},
        post: () => {},
        refresh: async () => {},
        withLoading: async (run) => await run(),
        webviewHost: {
          post: () => {},
          postState: () => {},
          postError: () => {},
          postRaccoonLoginFinished: () => {},
          postCustomProviderSaved: () => {},
        } as never,
      })

      await config.deleteAgent("mine", "user")

      // The agent key is actually removed from the loaded global file...
      const written = JSON.parse(await readFile(join(globalDir, "opencode.json"), "utf8"))
      expect(written.agent?.mine).toBeUndefined()
      expect(written.agent?.other).toMatchObject({ mode: "all" })
      // The SDK update is only used to invalidate opencode's global config
      // cache; the direct file rewrite above still performs the clean delete.
      expect(globalUpdates).toEqual([{ config: { agent: { mine: { disable: true } } } }])
      expect(globalDisposed).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(globalDir, { recursive: true, force: true })
    }
  })

  test("user-scope delete removes agents from jsonc config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "raccoon-agent-"))
    const globalDir = await mkdtemp(join(tmpdir(), "raccoon-global-"))
    try {
      await writeFile(
        join(globalDir, "opencode.jsonc"),
        '{\n  // user agents\n  "agent": {\n    "mine": { "mode": "subagent" },\n  },\n}\n',
      )
      const client = {
        instance: { dispose: async () => {} },
        path: { get: async () => ({ data: { config: globalDir } }) },
        global: {
          config: { update: async () => {} },
          dispose: async () => {},
        },
      }
      const config = new RaccoonProviderConfig({
        client: async () => client as never,
        directory: () => dir,
        getState: () => ({}) as never,
        setState: () => {},
        post: () => {},
        refresh: async () => {},
        withLoading: async (run) => await run(),
        webviewHost: {
          post: () => {},
          postState: () => {},
          postError: () => {},
          postRaccoonLoginFinished: () => {},
          postCustomProviderSaved: () => {},
        } as never,
      })

      await config.deleteAgent("mine", "user")

      expect(await readFile(join(globalDir, "opencode.jsonc"), "utf8")).not.toContain('"mine"')
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(globalDir, { recursive: true, force: true })
    }
  })

  test("project-scope delete falls back to user config when project has no matching agent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "raccoon-agent-"))
    const globalDir = await mkdtemp(join(tmpdir(), "raccoon-global-"))
    try {
      await writeFile(
        join(globalDir, "opencode.json"),
        JSON.stringify({ agent: { mine: { mode: "subagent" }, other: { mode: "all" } } }),
      )
      const client = {
        instance: { dispose: async () => {} },
        path: { get: async () => ({ data: { config: globalDir } }) },
        global: {
          config: { update: async () => {} },
          dispose: async () => {},
        },
      }
      const config = new RaccoonProviderConfig({
        client: async () => client as never,
        directory: () => dir,
        getState: () => ({}) as never,
        setState: () => {},
        post: () => {},
        refresh: async () => {},
        withLoading: async (run) => await run(),
        webviewHost: {
          post: () => {},
          postState: () => {},
          postError: () => {},
          postRaccoonLoginFinished: () => {},
          postCustomProviderSaved: () => {},
        } as never,
      })

      await config.deleteAgent("mine", "project")

      const written = JSON.parse(await readFile(join(globalDir, "opencode.json"), "utf8"))
      expect(written.agent?.mine).toBeUndefined()
      expect(written.agent?.other).toMatchObject({ mode: "all" })
      await expect(readFile(join(dir, "opencode.json"), "utf8")).rejects.toThrow()
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(globalDir, { recursive: true, force: true })
    }
  })

  test("user-scope delete removes markdown agent files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "raccoon-agent-"))
    const globalDir = await mkdtemp(join(tmpdir(), "raccoon-global-"))
    try {
      await mkdir(join(globalDir, "agents"), { recursive: true })
      await writeFile(join(globalDir, "agents", "mine.md"), "---\nmode: subagent\n---\n\nhelp")
      let globalDisposed = false
      const client = {
        instance: { dispose: async () => {} },
        path: { get: async () => ({ data: { config: globalDir } }) },
        global: {
          config: { update: async () => {} },
          dispose: async () => {
            globalDisposed = true
          },
        },
      }
      const config = new RaccoonProviderConfig({
        client: async () => client as never,
        directory: () => dir,
        getState: () => ({}) as never,
        setState: () => {},
        post: () => {},
        refresh: async () => {},
        withLoading: async (run) => await run(),
        webviewHost: {
          post: () => {},
          postState: () => {},
          postError: () => {},
          postRaccoonLoginFinished: () => {},
          postCustomProviderSaved: () => {},
        } as never,
      })

      await config.deleteAgent("mine", "user")

      await expect(stat(join(globalDir, "agents", "mine.md"))).rejects.toThrow()
      expect(globalDisposed).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(globalDir, { recursive: true, force: true })
    }
  })

  test("user-scope create writes the exact agent to the global config file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "raccoon-agent-"))
    const globalDir = await mkdtemp(join(tmpdir(), "raccoon-global-"))
    try {
      let globalDisposed = false
      const client = {
        instance: { dispose: async () => {} },
        path: { get: async () => ({ data: { config: globalDir } }) },
        global: {
          config: { update: async () => {} },
          dispose: async () => {
            globalDisposed = true
          },
        },
      }
      const config = new RaccoonProviderConfig({
        client: async () => client as never,
        directory: () => dir,
        getState: () => ({}) as never,
        setState: () => {},
        post: () => {},
        refresh: async () => {},
        withLoading: async (run) => await run(),
        webviewHost: {
          post: () => {},
          postState: () => {},
          postError: () => {},
          postRaccoonLoginFinished: () => {},
          postCustomProviderSaved: () => {},
        } as never,
      })

      await config.configureAgent({
        type: "configureAgent",
        requestID: "create-user-helper",
        scope: "user",
        agent: { name: "helper", mode: "subagent", description: "global helper" },
      })

      // Empty global dir → defaults to the raccoon-branded config file.
      const written = JSON.parse(await readFile(join(globalDir, "raccoon.jsonc"), "utf8"))
      expect(written.agent?.helper).toMatchObject({ mode: "subagent", description: "global helper" })
      expect(globalDisposed).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(globalDir, { recursive: true, force: true })
    }
  })

  test("moving and renaming an agent from project to user removes the project source", async () => {
    const dir = await mkdtemp(join(tmpdir(), "raccoon-agent-"))
    const globalDir = await mkdtemp(join(tmpdir(), "raccoon-global-"))
    try {
      await writeFile(join(dir, "raccoon.json"), JSON.stringify({ agent: { reviewer: { mode: "subagent" } } }))
      const client = {
        instance: { dispose: async () => {} },
        path: { get: async () => ({ data: { config: globalDir } }) },
        global: {
          config: { update: async () => {} },
          dispose: async () => {},
        },
      }
      const config = new RaccoonProviderConfig({
        client: async () => client as never,
        directory: () => dir,
        getState: () => ({}) as never,
        setState: () => {},
        post: () => {},
        refresh: async () => {},
        withLoading: async (run) => await run(),
        webviewHost: { post: () => {} } as never,
      })

      await config.configureAgent({
        type: "configureAgent",
        requestID: "move-project-user",
        original: { name: "reviewer", scope: "project" },
        scope: "user",
        agent: { name: "global-reviewer", mode: "subagent", description: "moved" },
      })

      const project = JSON.parse(await readFile(join(dir, "raccoon.json"), "utf8"))
      const user = JSON.parse(await readFile(join(globalDir, "raccoon.jsonc"), "utf8"))
      expect(project.agent?.reviewer).toBeUndefined()
      expect(user.agent?.["global-reviewer"]).toMatchObject({ mode: "subagent", description: "moved" })
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(globalDir, { recursive: true, force: true })
    }
  })

  test("moving an agent from user to project removes the user source", async () => {
    const dir = await mkdtemp(join(tmpdir(), "raccoon-agent-"))
    const globalDir = await mkdtemp(join(tmpdir(), "raccoon-global-"))
    try {
      await writeFile(join(globalDir, "raccoon.json"), JSON.stringify({ agent: { helper: { mode: "subagent" } } }))
      const client = {
        instance: { dispose: async () => {} },
        path: { get: async () => ({ data: { config: globalDir } }) },
        global: {
          config: { update: async () => {} },
          dispose: async () => {},
        },
      }
      const config = new RaccoonProviderConfig({
        client: async () => client as never,
        directory: () => dir,
        getState: () => ({}) as never,
        setState: () => {},
        post: () => {},
        refresh: async () => {},
        withLoading: async (run) => await run(),
        webviewHost: { post: () => {} } as never,
      })

      await config.configureAgent({
        type: "configureAgent",
        requestID: "move-user-project",
        original: { name: "helper", scope: "user" },
        scope: "project",
        agent: { name: "helper", mode: "all", description: "local" },
      })

      const project = JSON.parse(await readFile(join(dir, "raccoon.jsonc"), "utf8"))
      const user = JSON.parse(await readFile(join(globalDir, "raccoon.json"), "utf8"))
      expect(project.agent?.helper).toMatchObject({ mode: "all", description: "local" })
      expect(user.agent?.helper).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(globalDir, { recursive: true, force: true })
    }
  })
})
