import { spawn, type ChildProcess } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2/client"
import type { ConnectionPort, ConnectionState, ServerConfig } from "@opencode-ai/raccoon-core"

// Port of raccoon-vscode's RaccoonServerManager + RaccoonConnectionService, with the vscode
// dependency removed. Spawns the bundled opencode server (bin/raccoon) and exposes the SDK
// client + server config to the orchestrator through the ConnectionPort contract.
//
// Configuration that VSCode read from workspace settings is sourced from env vars here:
//   RACCOON_BIN          absolute path to the opencode server binary (else PATH `raccoon`)
//   RACCOON_SERVER_URL   attach to an already-running server instead of spawning

type StateListener = (state: ConnectionState) => void

export class SidecarConnection implements ConnectionPort {
  private client: OpencodeClient | null = null
  private config: ServerConfig | null = null
  private state: ConnectionState = "disconnected"
  private connectPromise: Promise<void> | null = null
  private serverProcess?: ChildProcess
  private startup?: Promise<ServerInstance>
  private readonly stateListeners = new Set<StateListener>()

  constructor(
    private readonly workspaceDirectory: string,
    private readonly log: (message: string) => void,
  ) {}

  onStateChange(listener: StateListener) {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  getServerConfig() {
    return this.config
  }

  async getClientAsync(directory: string) {
    if (!this.client) await this.connect(directory)
    return this.client!
  }

  async connect(directory: string) {
    if (this.client) return
    if (this.connectPromise) return this.connectPromise
    this.setState("connecting")
    this.connectPromise = this.doConnect(directory)
    try {
      await this.connectPromise
    } catch (error) {
      this.client = null
      this.config = null
      this.setState("error")
      throw error
    } finally {
      this.connectPromise = null
    }
  }

  dispose() {
    this.serverProcess?.kill()
    this.serverProcess = undefined
    this.client = null
    this.config = null
    this.setState("disconnected")
    this.stateListeners.clear()
  }

  private async doConnect(directory: string) {
    const server = await this.getServer()
    this.config = { baseUrl: server.url, port: server.port }
    this.client = createOpencodeClient({
      baseUrl: server.url,
      headers: server.headers,
      throwOnError: true,
      directory,
    })
    this.setState("connected")
  }

  private async getServer(): Promise<ServerInstance> {
    this.startup ??= this.startServer()
    try {
      return await this.startup
    } finally {
      this.startup = undefined
    }
  }

  private setState(state: ConnectionState) {
    if (this.state === state) return
    this.state = state
    for (const listener of this.stateListeners) listener(state)
  }

  private async startServer(): Promise<ServerInstance> {
    const configured = process.env.RACCOON_SERVER_URL?.trim()
    if (configured) return { url: configured.replace(/\/+$/, "") }

    const port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384
    const sourceDirectory = process.env.RACCOON_SOURCE_DIR?.trim()
    const binary = process.env.RACCOON_BIN?.trim()
    const command = sourceDirectory ? (process.env.RACCOON_BUN?.trim() || "bun") : binary && existsSync(binary) ? binary : "raccoon"
    const args = sourceDirectory
      ? ["run", "--cwd", sourceDirectory, "dev", "--", "serve", "--port", String(port), "--hostname", "127.0.0.1"]
      : ["serve", "--port", String(port), "--hostname", "127.0.0.1"]
    const password = randomBytes(24).toString("base64url")
    const headers = { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}` }
    this.log(`starting Raccoon server: ${command} ${args.join(" ")}`)
    const child = spawn(command, args, {
      cwd: this.workspaceDirectory,
      env: { ...process.env, OPENCODE_CALLER: "intellij", OPENCODE_SERVER_PASSWORD: password },
      stdio: ["ignore", "pipe", "pipe"],
    })
    this.serverProcess = child

    const recent = recentOutput()
    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString()
      recent.push(text)
      this.log(text)
    })
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString()
      recent.push(text)
      this.log(text)
    })

    let ready = false
    const startupFailure = new Promise<never>((_, reject) => {
      let failed = false
      const fail = (error: Error) => {
        if (failed || ready) return
        failed = true
        reject(error)
      }
      child.once("error", (error) => {
        fail(new ServerStartupError(`Failed to start Raccoon server: ${error.message}`))
      })
      child.once("exit", (code, signal) => {
        this.log(`Raccoon server exited with code ${code ?? "unknown"}${signal ? `, signal ${signal}` : ""}`)
        if (this.serverProcess === child) this.serverProcess = undefined
        fail(
          new ServerStartupError(
            `Raccoon server exited before it became healthy (code ${code ?? "unknown"}${signal ? `, signal ${signal}` : ""})`,
          ),
        )
      })
    })
    child.on("exit", () => {
      if (this.serverProcess === child) this.serverProcess = undefined
    })

    const url = `http://127.0.0.1:${port}`
    try {
      await Promise.race([this.wait(url, headers), startupFailure])
      ready = true
    } catch (error) {
      child.kill()
      if (error instanceof ServerStartupError) {
        throw new ServerStartupError([error.message, recent.summary()].filter(Boolean).join("\n"))
      }
      throw new ServerStartupError([`Timed out waiting for Raccoon server at ${url}`, recent.summary()].filter(Boolean).join("\n"))
    }
    this.log(`Raccoon server ready at ${url}`)
    return { url, headers, port, process: child }
  }

  private async wait(url: string, headers?: Record<string, string>) {
    for (let attempt = 0; attempt < 150; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      try {
        const response = await fetch(`${url}/global/health`, { headers })
        if (response.ok) return
      } catch {
        continue
      }
    }
    throw new ServerStartupError(`Timed out waiting for Raccoon server at ${url}`)
  }
}

type ServerInstance = {
  headers?: Record<string, string>
  url: string
  port?: number
  process?: ChildProcess
}

class ServerStartupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ServerStartupError"
  }
}

function recentOutput() {
  const chunks: string[] = []
  return {
    push(text: string) {
      chunks.push(text)
      while (chunks.join("").length > 4000) chunks.shift()
    },
    summary() {
      const text = chunks.join("").trim()
      if (!text) return ""
      return `Recent Raccoon output:\n${text}`
    },
  }
}
