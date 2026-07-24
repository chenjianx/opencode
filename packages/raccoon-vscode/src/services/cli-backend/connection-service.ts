import * as vscode from "vscode"
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2/client"
import { RaccoonServerManager } from "./server-manager.js"
import type { ConnectionState, ServerConfig } from "./types.js"

type StateListener = (state: ConnectionState) => void

export class RaccoonConnectionService implements vscode.Disposable {
  private readonly serverManager: RaccoonServerManager
  private readonly unsubscribeServerExit: () => void
  private client: OpencodeClient | null = null
  private config: ServerConfig | null = null
  private state: ConnectionState = "disconnected"
  private connectPromise: Promise<void> | null = null
  private shutdownPromise: Promise<void> | null = null
  private disposed = false
  private readonly stateListeners = new Set<StateListener>()

  constructor(
    context: vscode.ExtensionContext,
    output: vscode.OutputChannel,
    serverManager = new RaccoonServerManager(context, output),
  ) {
    this.serverManager = serverManager
    this.unsubscribeServerExit = this.serverManager.onServerExit(() => {
      this.client = null
      this.config = null
      if (!this.disposed) this.setState("disconnected")
    })
  }

  async connect(directory: string) {
    if (this.disposed) throw new Error("Raccoon connection service is disposed")
    if (this.client) return
    if (this.connectPromise) return this.connectPromise
    this.setState("connecting")
    this.connectPromise = this.doConnect(directory)
    try {
      await this.connectPromise
    } catch (error) {
      this.client = null
      this.config = null
      if (!this.disposed) this.setState("error")
      throw error
    } finally {
      this.connectPromise = null
    }
  }

  async getClientAsync(directory: string) {
    if (!this.client) await this.connect(directory)
    return this.client!
  }

  getClient() {
    if (!this.client) throw new Error("Not connected")
    return this.client
  }

  getServerConfig() {
    return this.config
  }

  getConnectionState() {
    return this.state
  }

  onStateChange(listener: StateListener) {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  dispose() {
    void this.shutdown()
  }

  shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise
    this.disposed = true
    this.client = null
    this.config = null
    this.setState("disconnected")
    this.stateListeners.clear()
    this.unsubscribeServerExit()
    this.shutdownPromise = this.serverManager.stop().then(async () => {
      await this.connectPromise?.catch(() => undefined)
    })
    return this.shutdownPromise
  }

  private async doConnect(directory: string) {
    const server = await this.serverManager.getServer()
    if (this.disposed) throw new Error("Raccoon connection service is disposed")
    if (!server) throw new Error("Failed to resolve Raccoon server")
    this.config = { baseUrl: server.url, port: server.port }
    this.client = createOpencodeClient({
      baseUrl: server.url,
      headers: server.headers,
      throwOnError: true,
      directory,
    })
    this.setState("connected")
  }

  private setState(state: ConnectionState) {
    if (this.state === state) return
    this.state = state
    for (const listener of this.stateListeners) listener(state)
  }
}
