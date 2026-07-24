import { EventEmitter } from "node:events"
import { beforeAll, describe, expect, mock, test } from "bun:test"
import type { RaccoonServerManager as RaccoonServerManagerType } from "./server-manager"

let RaccoonServerManager: typeof RaccoonServerManagerType
let serverUrl = ""
let opencodeCommand = "opencode-test"

beforeAll(async () => {
  mock.module("vscode", () => ({
    workspace: {
      workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
      getConfiguration: () => ({
        get: (key: string) => {
          if (key === "serverUrl") return serverUrl
          if (key === "opencodeCommand") return opencodeCommand
          return undefined
        },
      }),
    },
  }))
  RaccoonServerManager = (await import("./server-manager")).RaccoonServerManager
})

function createOutput() {
  const lines: string[] = []
  return {
    lines,
    channel: {
      append: (value: string) => lines.push(value),
      appendLine: (value: string) => lines.push(value),
    },
  }
}

function createChild() {
  const child = new EventEmitter() as EventEmitter & {
    kill: () => boolean
    killed: boolean
    stderr: EventEmitter
    stdout: EventEmitter
  }
  child.killed = false
  child.kill = () => {
    child.killed = true
    return true
  }
  child.stderr = new EventEmitter()
  child.stdout = new EventEmitter()
  return child
}

describe("RaccoonServerManager", () => {
  test("rejects immediately when the opencode process cannot spawn", async () => {
    serverUrl = ""
    const output = createOutput()
    const child = createChild()
    const manager = new RaccoonServerManager(
      { extensionPath: "/extension" } as never,
      output.channel as never,
      {
        existsSync: () => false,
        fetch: async () => {
          throw new Error("not ready")
        },
        getConfig: (key) => {
          if (key === "serverUrl") return serverUrl
          if (key === "opencodeCommand") return opencodeCommand
          return undefined
        },
        spawn: () => child as never,
        workspaceDirectory: () => "/workspace",
      },
    )

    const result = manager.getServer()
    child.emit("error", new Error("ENOENT"))

    await expect(result).rejects.toThrow("Failed to start Raccoon server: ENOENT")
    expect(child.killed).toBe(true)
  })

  test("rejects when the process exits before health succeeds", async () => {
    serverUrl = ""
    const output = createOutput()
    const child = createChild()
    const manager = new RaccoonServerManager(
      { extensionPath: "/extension" } as never,
      output.channel as never,
      {
        existsSync: () => false,
        fetch: async () => {
          throw new Error("not ready")
        },
        getConfig: (key) => {
          if (key === "serverUrl") return serverUrl
          if (key === "opencodeCommand") return opencodeCommand
          return undefined
        },
        spawn: () => child as never,
        workspaceDirectory: () => "/workspace",
      },
    )

    const result = manager.getServer()
    child.stderr.emit("data", Buffer.from("port already in use"))
    child.emit("exit", 1, null)

    await expect(result).rejects.toThrow("Raccoon server exited before it became healthy")
    await expect(result).rejects.toThrow("port already in use")
    expect(child.killed).toBe(true)
  })

  test("uses configured server URL without spawning a process", async () => {
    serverUrl = "http://127.0.0.1:9000/"
    const output = createOutput()
    let spawned = false
    const manager = new RaccoonServerManager(
      { extensionPath: "/extension" } as never,
      output.channel as never,
      {
        existsSync: () => false,
        fetch: async () => ({ ok: true }) as Response,
        getConfig: (key) => {
          if (key === "serverUrl") return serverUrl
          if (key === "opencodeCommand") return opencodeCommand
          return undefined
        },
        spawn: () => {
          spawned = true
          return createChild() as never
        },
        workspaceDirectory: () => "/workspace",
      },
    )

    await expect(manager.getServer()).resolves.toEqual({ url: "http://127.0.0.1:9000" })
    expect(spawned).toBe(false)
  })

  test("starts managed server with local auth headers", async () => {
    serverUrl = ""
    const output = createOutput()
    const child = createChild()
    let env: NodeJS.ProcessEnv | undefined
    let healthAuthorization: string | undefined
    const manager = new RaccoonServerManager(
      { extensionPath: "/extension" } as never,
      output.channel as never,
      {
        existsSync: () => false,
        fetch: async (_url, init) => {
          healthAuthorization = (init?.headers as Record<string, string> | undefined)?.Authorization
          return { ok: true } as Response
        },
        getConfig: (key) => {
          if (key === "serverUrl") return serverUrl
          if (key === "opencodeCommand") return opencodeCommand
          return undefined
        },
        spawn: (_command, _args, options) => {
          env = options?.env
          return child as never
        },
        workspaceDirectory: () => "/workspace",
      },
    )

    const server = await manager.getServer()

    expect(env?.OPENCODE_SERVER_PASSWORD).toBeString()
    expect(env?.OPENCODE_SERVER_PASSWORD).not.toBe("")
    expect(server.headers?.Authorization).toBe(healthAuthorization)
    expect(server.headers?.Authorization).toStartWith("Basic ")
  })

  test("stops a managed process while startup is still pending", async () => {
    serverUrl = ""
    const output = createOutput()
    const child = createChild()
    const manager = new RaccoonServerManager(
      { extensionPath: "/extension" } as never,
      output.channel as never,
      {
        existsSync: () => false,
        fetch: async () => ({ ok: true }) as Response,
        getConfig: (key) => {
          if (key === "serverUrl") return serverUrl
          if (key === "opencodeCommand") return opencodeCommand
          return undefined
        },
        spawn: () => child as never,
        workspaceDirectory: () => "/workspace",
      },
    )

    const startup = manager.getServer()
    await Promise.resolve()
    const stopping = manager.stop()
    child.emit("exit", null, "SIGTERM")
    const rejection = expect(startup).rejects.toThrow("Raccoon server")
    await stopping

    await rejection
    expect(child.killed).toBe(true)
  })

  test("notifies listeners when a running managed server exits", async () => {
    serverUrl = ""
    const output = createOutput()
    const child = createChild()
    const manager = new RaccoonServerManager(
      { extensionPath: "/extension" } as never,
      output.channel as never,
      {
        existsSync: () => false,
        fetch: async () => ({ ok: true }) as Response,
        getConfig: (key) => {
          if (key === "serverUrl") return serverUrl
          if (key === "opencodeCommand") return opencodeCommand
          return undefined
        },
        spawn: () => child as never,
        workspaceDirectory: () => "/workspace",
      },
    )
    let exits = 0
    manager.onServerExit(() => exits++)

    await manager.getServer()
    child.emit("exit", 1, null)

    expect(exits).toBe(1)
  })
})
