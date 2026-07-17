import type { FilePartInput } from "@opencode-ai/sdk/v2/client"
import type { ChatMode, RaccoonPluginLanguageMode, WebviewToExtension } from "@opencode-ai/raccoon-webview"
import type { ModelSelection } from "../session/model-state.js"
import type { RaccoonWebviewSource } from "../platform.js"

type MessageRouterDeps = {
  markReady: (source: RaccoonWebviewSource) => void
  // Push the orchestrator's current state to ready webviews without reloading data.
  // Used when the settings panel mounts: a full refresh() would fan a loading→idle
  // cycle and reloaded messages into the chat webview (postState reaches both
  // surfaces), making the chat flash. The settings panel renders from current state.
  postState: () => void
  createSession: (mode: ChatMode) => Promise<void>
  refresh: () => Promise<void>
  openHistory: () => Promise<void>
  openSettings: () => Promise<void>
  closeSettings: () => void
  selectSession: (sessionID: string) => Promise<void>
  openSubAgent: (sessionID: string, title: string | undefined, source: RaccoonWebviewSource) => Promise<void>
  closeSubAgent: () => void
  renameSession: (sessionID: string, title: string) => Promise<void>
  deleteSession: (sessionID: string) => Promise<void>
  exportSession: (sessionID: string) => Promise<void>
  revertSession: (sessionID: string, messageID: string, source: RaccoonWebviewSource) => Promise<void>
  unrevertSession: (sessionID: string, source: RaccoonWebviewSource) => Promise<void>
  runSlashCommand: (name: string, source: RaccoonWebviewSource) => Promise<void>
  setMode: (mode: ChatMode) => void
  setPluginLanguage: (language: RaccoonPluginLanguageMode) => void
  setAutocompleteEnabled: (enabled: boolean) => Promise<void> | void
  setModel: (model: ModelSelection | undefined) => Promise<void>
  setModeModel: (mode: ChatMode, model?: ModelSelection) => Promise<void>
  setModelEnabled: (model: { providerID: string; modelID: string }, enabled: boolean) => Promise<void>
  setProviderEnabled: (providerID: string, enabled: boolean) => Promise<void>
  loginRaccoon: (serverUrl: string | undefined, source: RaccoonWebviewSource) => Promise<void>
  cancelRaccoonLogin: () => void
  logoutRaccoon: () => Promise<void>
  configureProvider: (providerID: string, apiKey: string) => Promise<void>
  configureAgent: (message: Extract<WebviewToExtension, { type: "configureAgent" }>) => Promise<void>
  deleteAgent: (name: string, scope: Extract<WebviewToExtension, { type: "deleteAgent" }>["scope"]) => Promise<void>
  saveRule: (message: Extract<WebviewToExtension, { type: "saveRule" }>) => Promise<void>
  toggleRule: (message: Extract<WebviewToExtension, { type: "toggleRule" }>) => Promise<void>
  deleteRule: (message: Extract<WebviewToExtension, { type: "deleteRule" }>) => Promise<void>
  saveCommand: (message: Extract<WebviewToExtension, { type: "saveCommand" }>) => Promise<void>
  deleteCommand: (message: Extract<WebviewToExtension, { type: "deleteCommand" }>) => Promise<void>
  connectProvider: (message: Extract<WebviewToExtension, { type: "connectProvider" }>) => Promise<void>
  cancelProviderConnect: (providerID?: string) => void
  disconnectProvider: (providerID: string) => Promise<void>
  fetchCustomProviderModels: (message: Extract<WebviewToExtension, { type: "fetchCustomProviderModels" }>, source: RaccoonWebviewSource) => Promise<void>
  fetchMcpMarketplace: (force: boolean | undefined, source: RaccoonWebviewSource) => Promise<void>
  fetchSkillMarketplace: (force: boolean | undefined, source: RaccoonWebviewSource) => Promise<void>
  installMcpMarketplaceItem: (message: Extract<WebviewToExtension, { type: "installMcpMarketplaceItem" }>, source: RaccoonWebviewSource) => Promise<void>
  removeMcpMarketplaceItem: (message: Extract<WebviewToExtension, { type: "removeMcpMarketplaceItem" }>, source: RaccoonWebviewSource) => Promise<void>
  installSkillMarketplaceItem: (message: Extract<WebviewToExtension, { type: "installSkillMarketplaceItem" }>, source: RaccoonWebviewSource) => Promise<void>
  removeSkillMarketplaceItem: (message: Extract<WebviewToExtension, { type: "removeSkillMarketplaceItem" }>, source: RaccoonWebviewSource) => Promise<void>
  addMcpServerManual: (message: Extract<WebviewToExtension, { type: "addMcpServerManual" }>, source: RaccoonWebviewSource) => Promise<void>
  fetchMcpInstalled: (source: RaccoonWebviewSource) => Promise<void>
  fetchSkillInstalled: (source: RaccoonWebviewSource) => Promise<void>
  setMcpServerEnabled: (message: Extract<WebviewToExtension, { type: "setMcpServerEnabled" }>, source: RaccoonWebviewSource) => Promise<void>
  connectMcpServer: (message: Extract<WebviewToExtension, { type: "connectMcpServer" }>, source: RaccoonWebviewSource) => Promise<void>
  disconnectMcpServer: (message: Extract<WebviewToExtension, { type: "disconnectMcpServer" }>, source: RaccoonWebviewSource) => Promise<void>
  removeMcpServer: (message: Extract<WebviewToExtension, { type: "removeMcpServer" }>, source: RaccoonWebviewSource) => Promise<void>
  updateMcpServer: (message: Extract<WebviewToExtension, { type: "updateMcpServer" }>, source: RaccoonWebviewSource) => Promise<void>
  configureCustomProvider: (message: Extract<WebviewToExtension, { type: "configureCustomProvider" }>) => Promise<void>
  requestFileSearch: (requestID: string, query: string, kind?: "file" | "folder") => Promise<void>
  openFile: (filePath: string, line?: number, column?: number) => void
  openImage: (url: string, filename?: string, mime?: string) => Promise<void>
  requestTerminalContext: (requestID: string, source: RaccoonWebviewSource) => Promise<void>
  requestGitChangesContext: (requestID: string, source: RaccoonWebviewSource) => Promise<void>
  questionReply: (message: Extract<WebviewToExtension, { type: "questionReply" }>) => Promise<void>
  questionReject: (message: Extract<WebviewToExtension, { type: "questionReject" }>) => Promise<void>
  permissionReply: (message: Extract<WebviewToExtension, { type: "permissionReply" }>) => Promise<void>
  deleteCustomProvider: (providerID: string) => Promise<void>
  stopSession: () => Promise<void>
  sendMessage: (
    text: string,
    mode: ChatMode,
    model?: { providerID: string; modelID: string; variant?: string },
    files?: { path: string; filename?: string; mime?: string; url: string; source?: FilePartInput["source"] }[],
  ) => Promise<void>
}

export class RaccoonMessageRouter {
  constructor(private readonly deps: MessageRouterDeps) {}

  async handle(message: WebviewToExtension, source: RaccoonWebviewSource) {
    if (message.type === "webviewReady" || message.type === "ready") {
      this.deps.markReady(source)
      if (source === "settings") {
        this.deps.postState()
        return
      }
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
    if (message.type === "openSubAgent") {
      await this.deps.openSubAgent(message.sessionID, message.title, source)
      return
    }
    if (message.type === "closeSubAgent") {
      this.deps.closeSubAgent()
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
    if (message.type === "setPluginLanguage") {
      await this.deps.setPluginLanguage(message.language)
      return
    }
    if (message.type === "setAutocompleteEnabled") {
      await this.deps.setAutocompleteEnabled(message.enabled)
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
    if (message.type === "logoutRaccoon") {
      await this.deps.logoutRaccoon()
      return
    }
    if (message.type === "configureProvider") {
      await this.deps.configureProvider(message.providerID, message.apiKey)
      return
    }
    if (message.type === "configureAgent") {
      await this.deps.configureAgent(message)
      return
    }
    if (message.type === "deleteAgent") {
      await this.deps.deleteAgent(message.name, message.scope)
      return
    }
    if (message.type === "saveRule") {
      await this.deps.saveRule(message)
      return
    }
    if (message.type === "toggleRule") {
      await this.deps.toggleRule(message)
      return
    }
    if (message.type === "deleteRule") {
      await this.deps.deleteRule(message)
      return
    }
    if (message.type === "saveCommand") {
      await this.deps.saveCommand(message)
      return
    }
    if (message.type === "deleteCommand") {
      await this.deps.deleteCommand(message)
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
    if (message.type === "disconnectProvider") {
      await this.deps.disconnectProvider(message.providerID)
      return
    }
    if (message.type === "fetchCustomProviderModels") {
      await this.deps.fetchCustomProviderModels(message, source)
      return
    }
    if (message.type === "fetchMcpMarketplace") {
      await this.deps.fetchMcpMarketplace(message.force, source)
      return
    }
    if (message.type === "fetchSkillMarketplace") {
      await this.deps.fetchSkillMarketplace(message.force, source)
      return
    }
    if (message.type === "installMcpMarketplaceItem") {
      await this.deps.installMcpMarketplaceItem(message, source)
      return
    }
    if (message.type === "removeMcpMarketplaceItem") {
      await this.deps.removeMcpMarketplaceItem(message, source)
      return
    }
    if (message.type === "installSkillMarketplaceItem") {
      await this.deps.installSkillMarketplaceItem(message, source)
      return
    }
    if (message.type === "removeSkillMarketplaceItem") {
      await this.deps.removeSkillMarketplaceItem(message, source)
      return
    }
    if (message.type === "addMcpServerManual") {
      await this.deps.addMcpServerManual(message, source)
      return
    }
    if (message.type === "fetchMcpInstalled") {
      await this.deps.fetchMcpInstalled(source)
      return
    }
    if (message.type === "fetchSkillInstalled") {
      await this.deps.fetchSkillInstalled(source)
      return
    }
    if (message.type === "setMcpServerEnabled") {
      await this.deps.setMcpServerEnabled(message, source)
      return
    }
    if (message.type === "connectMcpServer") {
      await this.deps.connectMcpServer(message, source)
      return
    }
    if (message.type === "disconnectMcpServer") {
      await this.deps.disconnectMcpServer(message, source)
      return
    }
    if (message.type === "removeMcpServer") {
      await this.deps.removeMcpServer(message, source)
      return
    }
    if (message.type === "updateMcpServer") {
      await this.deps.updateMcpServer(message, source)
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
    if (message.type === "openImage") {
      await this.deps.openImage(message.url, message.filename, message.mime)
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
    if (message.type === "permissionReply") {
      await this.deps.permissionReply(message)
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
