import { spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import * as vscode from "vscode"

export type ServerInstance = {
  url: string
  port?: number
  process?: ChildProcess
}

export class ServerStartupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ServerStartupError"
  }
}

export class RaccoonServerManager implements vscode.Disposable {
  private instance?: ServerInstance
  private startup?: Promise<ServerInstance>

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
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
    this.instance?.process?.kill()
    this.instance = undefined
  }

  private async startServer(): Promise<ServerInstance> {
    const configured = vscode.workspace.getConfiguration("raccoon").get<string>("serverUrl")?.trim()
    if (configured) return { url: configured.replace(/\/+$/, "") }

    const port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384
    const binary = this.binaryPath()
    const command =
      existsSync(binary) ? binary : vscode.workspace.getConfiguration("raccoon").get<string>("opencodeCommand")?.trim() || "opencode"
    const args = ["serve", "--port", String(port), "--hostname", "127.0.0.1"]
    const child = spawn(command, args, {
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      env: { ...process.env, OPENCODE_CALLER: "vscode" },
      stdio: ["ignore", "pipe", "pipe"],
    })

    child.stdout?.on("data", (chunk) => this.output.append(chunk.toString()))
    child.stderr?.on("data", (chunk) => this.output.append(chunk.toString()))
    child.on("exit", (code) => {
      this.output.appendLine(`opencode server exited with code ${code ?? "unknown"}`)
      if (this.instance?.process === child) this.instance = undefined
    })

    const url = `http://127.0.0.1:${port}`
    await this.wait(url)
    return { url, port, process: child }
  }

  private async wait(url: string) {
    for (let attempt = 0; attempt < 150; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      try {
        const response = await fetch(`${url}/global/health`)
        if (response.ok) return
      } catch {
        continue
      }
    }
    throw new ServerStartupError(`Timed out waiting for opencode server at ${url}`)
  }

  private binaryPath() {
    const binName = process.platform === "win32" ? "opencode.exe" : "opencode"
    return join(this.context.extensionPath, "bin", binName)
  }
}
