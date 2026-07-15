import { spawn, type ChildProcess } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { join } from "node:path"
import * as vscode from "vscode"

type ServerProcess = Pick<ChildProcess, "kill" | "on" | "once" | "stderr" | "stdout">
type ServerManagerDeps = {
  existsSync: typeof existsSync
  fetch: typeof fetch
  getConfig: (key: "opencodeCommand" | "serverUrl") => string | undefined
  spawn: (command: string, args: string[], options: Parameters<typeof spawn>[2]) => ServerProcess
  workspaceDirectory: () => string | undefined
}

type ServerInstance = {
  headers?: Record<string, string>
  url: string
  port?: number
  process?: ServerProcess
}

export class ServerStartupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ServerStartupError"
  }
}

const SERVER_STOP_TIMEOUT = 6_000

export class RaccoonServerManager implements vscode.Disposable {
  private instance?: ServerInstance
  private startup?: Promise<ServerInstance>
  private stopping?: Promise<void>

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
    private readonly deps: ServerManagerDeps = {
      existsSync,
      fetch,
      getConfig: (key) => vscode.workspace.getConfiguration("raccoon").get<string>(key),
      spawn,
      workspaceDirectory: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    },
  ) {}

  async getServer(): Promise<ServerInstance> {
    if (this.instance) return this.instance
    this.startup ??= this.startServer()
    try {
      this.instance = await this.startup
      return this.instance
    } finally {
      this.startup = undefined
    }
  }

  dispose() {
    void this.stop()
  }

  // Graceful stop: ask the server to exit, then force-kill if it does not
  // exit within SERVER_STOP_TIMEOUT. Idempotent while a stop is in flight.
  async stop(): Promise<void> {
    const child = this.instance?.process
    this.instance = undefined
    if (!child) return
    if (this.stopping) return this.stopping

    let exited = false
    const done = new Promise<void>((resolve) =>
      child.once("exit", () => {
        exited = true
        resolve()
      }),
    )
    child.kill("SIGTERM")
    this.stopping = Promise.race([
      done,
      delay(SERVER_STOP_TIMEOUT).then(() => {
        if (!exited) child.kill("SIGKILL")
      }),
    ]).then(() => {
      this.stopping = undefined
    })
    return this.stopping
  }

  private async startServer(): Promise<ServerInstance> {
    // Allow attaching to an externally-managed server (e.g. a source-built
    // server launched under the debugger). RACCOON_SERVER_URL is only set when
    // debugging via launch.json; packaged builds leave it unset and fall back
    // to spawning bin/raccoon below.
    const configured = this.deps.getConfig("serverUrl")?.trim() || process.env.RACCOON_SERVER_URL?.trim()
    if (configured) return { url: configured.replace(/\/+$/, "") }

    const port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384
    const binary = this.binaryPath()
    const command = this.deps.existsSync(binary) ? binary : this.deps.getConfig("opencodeCommand")?.trim() || "raccoon"
    const args = ["serve", "--port", String(port), "--hostname", "127.0.0.1"]
    const password = randomBytes(24).toString("base64url")
    const headers = { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}` }
    this.output.appendLine(`starting Raccoon server: ${command} ${args.join(" ")}`)
    const child = this.deps.spawn(command, args, {
      cwd: this.deps.workspaceDirectory(),
      env: sidecarEnv(password),
      stdio: ["ignore", "pipe", "pipe"],
    })

    const output = recentOutput()
    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString()
      output.push(text)
      this.output.append(text)
    })
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString()
      output.push(text)
      this.output.append(text)
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
        this.output.appendLine(`Raccoon server exited with code ${code ?? "unknown"}${signal ? `, signal ${signal}` : ""}`)
        if (this.instance?.process === child) this.instance = undefined
        fail(
          new ServerStartupError(
            `Raccoon server exited before it became healthy (code ${code ?? "unknown"}${signal ? `, signal ${signal}` : ""})`,
          ),
        )
      })
    })
    child.on("exit", (code) => {
      if (this.instance?.process === child) this.instance = undefined
    })

    const url = `http://127.0.0.1:${port}`
    try {
      await Promise.race([this.wait(url, headers), startupFailure])
      ready = true
    } catch (error) {
      child.kill()
      if (error instanceof ServerStartupError) {
        throw new ServerStartupError([error.message, output.summary()].filter(Boolean).join("\n"))
      }
      throw new ServerStartupError(
        [`Timed out waiting for Raccoon server at ${url}`, output.summary()].filter(Boolean).join("\n"),
      )
    }
    this.output.appendLine(`Raccoon server ready at ${url}`)
    return { url, headers, port, process: child }
  }

  private async wait(url: string, headers?: Record<string, string>) {
    for (let attempt = 0; attempt < 150; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      try {
        const response = await this.deps.fetch(`${url}/global/health`, {
          headers,
          signal: AbortSignal.timeout(3000),
        })
        if (response.ok) return
      } catch {
        continue
      }
    }
    throw new ServerStartupError(`Timed out waiting for Raccoon server at ${url}`)
  }

  private binaryPath() {
    const binName = process.platform === "win32" ? "raccoon.exe" : "raccoon"
    return join(this.context.extensionPath, "bin", binName)
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

// Build the server env, stripping vars that can interfere with the spawned
// binary before injecting the caller identity and auth password.
function sidecarEnv(password: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.DEBUG
  if (process.platform === "linux") delete env.LD_PRELOAD
  env.OPENCODE_CALLER = "vscode"
  env.OPENCODE_SERVER_PASSWORD = password
  return env
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
