import type { FilePartInput } from "@opencode-ai/sdk/v2/client"
import type { ChatMode, WebviewToExtension } from "@opencode-ai/raccoon-webview"
import type { ModelSelection } from "./model-state.js"
import type { RaccoonWebviewSource } from "./webview-host.js"

type MessageRouterDeps = {
  markReady: (source: RaccoonWebviewSource) => void
  createSession: (mode: ChatMode) => Promise<void>
  refresh: () => Promise<void>
  openHistory: () => Promise<void>
  openSettings: () => Promise<void>
  closeSettings: () => void
  selectSession: (sessionID: string) => Promise<void>
  renameSession: (sessionID: string, title: string) => Promise<void>
  deleteSession: (sessionID: string) => Promise<void>
  exportSession: (sessionID: string) => Promise<void>
  revertSession: (sessionID: string, messageID: string, source: RaccoonWebviewSource) => Promise<void>
  unrevertSession: (sessionID: string, source: RaccoonWebviewSource) => Promise<void>
  runSlashCommand: (name: string, source: RaccoonWebviewSource) => Promise<void>
  setMode: (mode: ChatMode) => void
  setModel: (model: ModelSelection | undefined) => Promise<void>
  setModeModel: (mode: ChatMode, model: ModelSelection) => Promise<void>
  setModelEnabled: (model: { providerID: string; modelID: string }, enabled: boolean) => Promise<void>
  setProviderEnabled: (providerID: string, enabled: boolean) => Promise<void>
  loginRaccoon: (serverUrl: string | undefined, source: RaccoonWebviewSource) => Promise<void>
  cancelRaccoonLogin: () => void
  configureProvider: (providerID: string, apiKey: string) => Promise<void>
  connectProvider: (message: Extract<WebviewToExtension, { type: "connectProvider" }>) => Promise<void>
  cancelProviderConnect: (providerID?: string) => void
  fetchCustomProviderModels: (message: Extract<WebviewToExtension, { type: "fetchCustomProviderModels" }>, source: RaccoonWebviewSource) => Promise<void>
  configureCustomProvider: (message: Extract<WebviewToExtension, { type: "configureCustomProvider" }>) => Promise<void>
  requestFileSearch: (requestID: string, query: string, kind?: "file" | "folder") => Promise<void>
  openFile: (filePath: string, line?: number, column?: number) => void
  requestTerminalContext: (requestID: string, source: RaccoonWebviewSource) => Promise<void>
  requestGitChangesContext: (requestID: string, source: RaccoonWebviewSource) => Promise<void>
  questionReply: (message: Extract<WebviewToExtension, { type: "questionReply" }>) => Promise<void>
  questionReject: (message: Extract<WebviewToExtension, { type: "questionReject" }>) => Promise<void>
  deleteCustomProvider: (providerID: string) => Promise<void>
  stopSession: () => Promise<void>
  sendMessage: (
    text: string,
    mode: ChatMode,
    model?: { providerID: string; modelID: string },
    files?: { path: string; filename?: string; mime?: string; url: string; source?: FilePartInput["source"] }[],
  ) => Promise<void>
}

export class RaccoonMessageRouter {
  constructor(private readonly deps: MessageRouterDeps) {}

  async handle(message: WebviewToExtension, source: RaccoonWebviewSource) {
    if (message.type === "webviewReady" || message.type === "ready") {
      this.deps.markReady(source)
      await this.deps.refresh()
      return
    }
    if (message.type === "refresh") {
      await this.deps.refresh()
      return
    }
    if (message.type === "createSession") {
      await this.deps.createSession(message.mode)
      return
    }
    if (message.type === "openHistory") {
      await this.deps.openHistory()
      return
    }
    if (message.type === "openSettings") {
      await this.deps.openSettings()
      return
    }
    if (message.type === "closeSettings") {
      this.deps.closeSettings()
      return
    }
    if (message.type === "selectSession") {
      await this.deps.selectSession(message.sessionID)
      return
    }
    if (message.type === "renameSession") {
      await this.deps.renameSession(message.sessionID, message.title)
      return
    }
    if (message.type === "deleteSession") {
      await this.deps.deleteSession(message.sessionID)
      return
    }
    if (message.type === "exportSession") {
      await this.deps.exportSession(message.sessionID)
      return
    }
    if (message.type === "revertSession") {
      await this.deps.revertSession(message.sessionID, message.messageID, source)
      return
    }
    if (message.type === "unrevertSession") {
      await this.deps.unrevertSession(message.sessionID, source)
      return
    }
    if (message.type === "runSlashCommand") {
      await this.deps.runSlashCommand(message.name, source)
      return
    }
    if (message.type === "setMode") {
      this.deps.setMode(message.mode)
      return
    }
    if (message.type === "setModel") {
      await this.deps.setModel(message.model)
      return
    }
    if (message.type === "setModeModel") {
      await this.deps.setModeModel(message.mode, message.model)
      return
    }
    if (message.type === "setModelEnabled") {
      await this.deps.setModelEnabled(message.model, message.enabled)
      return
    }
    if (message.type === "setProviderEnabled") {
      await this.deps.setProviderEnabled(message.providerID, message.enabled)
      return
    }
    if (message.type === "loginRaccoon") {
      await this.deps.loginRaccoon(message.serverUrl, source)
      return
    }
    if (message.type === "cancelRaccoonLogin") {
      this.deps.cancelRaccoonLogin()
      return
    }
    if (message.type === "configureProvider") {
      await this.deps.configureProvider(message.providerID, message.apiKey)
      return
    }
    if (message.type === "connectProvider") {
      await this.deps.connectProvider(message)
      return
    }
    if (message.type === "cancelProviderConnect") {
      this.deps.cancelProviderConnect(message.providerID)
      return
    }
    if (message.type === "fetchCustomProviderModels") {
      await this.deps.fetchCustomProviderModels(message, source)
      return
    }
    if (message.type === "configureCustomProvider") {
      await this.deps.configureCustomProvider(message)
      return
    }
    if (message.type === "requestFileSearch") {
      await this.deps.requestFileSearch(message.requestID, message.query, message.kind)
      return
    }
    if (message.type === "openFile") {
      this.deps.openFile(message.filePath, message.line, message.column)
      return
    }
    if (message.type === "requestTerminalContext") {
      await this.deps.requestTerminalContext(message.requestID, source)
      return
    }
    if (message.type === "requestGitChangesContext") {
      await this.deps.requestGitChangesContext(message.requestID, source)
      return
    }
    if (message.type === "questionReply") {
      await this.deps.questionReply(message)
      return
    }
    if (message.type === "questionReject") {
      await this.deps.questionReject(message)
      return
    }
    if (message.type === "deleteCustomProvider") {
      await this.deps.deleteCustomProvider(message.providerID)
      return
    }
    if (message.type === "stopSession") {
      await this.deps.stopSession()
      return
    }
    if (message.type === "sendMessage") {
      await this.deps.sendMessage(message.text, message.mode, message.model, message.files)
    }
  }
}
