import * as vscode from "vscode"
import {
  type Message,
  type OpencodeClient,
  type Part,
  type Session,
} from "@opencode-ai/sdk/v2/client"
import type {
  ChatMode,
  ExtensionToWebview,
  RaccoonMessage,
  RaccoonPluginLanguage,
  RaccoonState,
  WebviewToExtension,
} from "@opencode-ai/raccoon-webview"
import { RaccoonConnectionService, type ConnectionState } from "../services/cli-backend/index.js"
import { MarketplaceService } from "../services/marketplace/index.js"
import type { McpStatus } from "../services/marketplace/index.js"
import {
  mapPart,
  messageText,
} from "./mapping.js"
import { gitChangesContext, terminalContext } from "./context-mentions.js"
import {
  createEditorContext,
  createPrompt,
  getEditorContext,
  type EditorContextAction,
} from "./editor-context.js"
import { searchFiles } from "./file-search.js"
import {
  removePart as removeSessionPart,
  removeSession as removeSessionState,
  upsertMessage as upsertSessionMessage,
  upsertPart as upsertSessionPart,
  upsertSession as upsertSessionState,
} from "./session-state.js"
import { FetchModelsError, fetchOpenAIModels } from "./openai-models.js"
import { RaccoonStreamScheduler } from "./stream-scheduler.js"
import { RaccoonEventStream } from "./event-stream.js"
import { RaccoonEventHandler } from "./event-handler.js"
import { RaccoonMessageRouter } from "./message-router.js"
import { RaccoonProviderConfig } from "./provider-config.js"
import { RaccoonRulesConfig } from "./rules-config.js"
import { RaccoonSessionController } from "./session-controller.js"
import { RaccoonWebviewHost, type RaccoonWebviewSource } from "./webview-host.js"

function isAbsolutePath(filePath: string) {
  if (filePath.charCodeAt(0) === 47) return true
  if (
    filePath.length >= 3 &&
    filePath.charCodeAt(1) === 58 &&
    (filePath.charCodeAt(2) === 92 || filePath.charCodeAt(2) === 47) &&
    ((filePath.charCodeAt(0) >= 65 && filePath.charCodeAt(0) <= 90) ||
      (filePath.charCodeAt(0) >= 97 && filePath.charCodeAt(0) <= 122))
  )
    return true
  return filePath.length >= 2 && filePath.charCodeAt(0) === 92 && filePath.charCodeAt(1) === 92
}

function imageExtension(filename: string | undefined, mime: string) {
  const current = filename?.match(/\.[A-Za-z0-9]+$/)?.[0]
  if (current) return current
  if (mime === "image/jpeg") return ".jpg"
  if (mime === "image/gif") return ".gif"
  if (mime === "image/webp") return ".webp"
  if (mime === "image/svg+xml") return ".svg"
  return ".png"
}

function normalizePluginLanguage(value: string | undefined): RaccoonPluginLanguage {
  if (value?.toLowerCase().startsWith("zh")) return "zh-Hans"
  return "en"
}

function readAutocompleteEnabled(): boolean {
  return vscode.workspace.getConfiguration("raccoon.autocomplete").get<boolean>("enableAutoTrigger") ?? true
}

export class RaccoonProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "raccoon.chat"

  private readonly didChangeState = new vscode.EventEmitter<void>()
  private eventRefreshTimer?: ReturnType<typeof setTimeout>
  private unsubscribeState?: () => void
  private readonly autocompleteConfigListener: vscode.Disposable
  private readonly pendingPartDeltas = new Map<string, string>()
  private readonly streams = new RaccoonStreamScheduler((message) => this.webviewHost.post("chat", message))
  private readonly webviewHost: RaccoonWebviewHost
  private readonly eventStream: RaccoonEventStream
  private readonly eventHandler: RaccoonEventHandler
  private readonly messageRouter: RaccoonMessageRouter
  private readonly config: RaccoonProviderConfig
  private readonly rules: RaccoonRulesConfig
  private readonly sessions: RaccoonSessionController
  private readonly marketplace = new MarketplaceService()
  private state: RaccoonState = {
    sessions: [],
    messages: [],
    agents: [],
    models: [],
    providers: [],
    mode: "build",
    loading: true,
    pluginLanguageMode: "auto",
    pluginLanguage: normalizePluginLanguage(vscode.env.language),
    autocompleteEnabled: readAutocompleteEnabled(),
  }

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly storageUri: vscode.Uri,
    private readonly connection: RaccoonConnectionService,
    private readonly output: vscode.OutputChannel,
    private readonly storage?: vscode.Memento,
  ) {
    this.unsubscribeState = this.connection.onStateChange((state) => this.onConnectionState(state))
    this.autocompleteConfigListener = vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("raccoon.autocomplete.enableAutoTrigger")) return
      const enabled = readAutocompleteEnabled()
      if (enabled === this.state.autocompleteEnabled) return
      this.state = { ...this.state, autocompleteEnabled: enabled }
      this.post()
    })
    this.webviewHost = new RaccoonWebviewHost(this.extensionUri, this.connection, (message, source) => void this.handle(message, source))
    this.config = new RaccoonProviderConfig({
      client: () => this.client(),
      directory: () => this.directory(),
      getState: () => this.state,
      setState: (state) => {
        this.state = state
      },
      post: () => this.post(),
      refresh: () => this.refresh(),
      withLoading: (run) => this.withLoading(run),
      storage,
      webviewHost: this.webviewHost,
      pluginLanguage: () => normalizePluginLanguage(vscode.env.language),
    })
    this.state = { ...this.state, ...this.config.initialState() }
    this.rules = new RaccoonRulesConfig({
      client: () => this.client(),
      directory: () => this.directory(),
      refresh: () => this.refresh(),
    })
    this.sessions = new RaccoonSessionController({
      client: () => this.client(),
      directory: () => this.directory(),
      getState: () => this.state,
      setState: (state) => {
        this.state = state
      },
      post: () => this.post(),
      withLoading: (run) => this.withLoading(run),
      ensureEventStream: () => this.ensureEventStream(),
      loadModels: (client) => this.config.loadModels(client),
      removeSession: (sessionID) => this.removeSession(sessionID),
      report: (error) => this.report(error),
      log: (message) => this.output.appendLine(message),
      config: this.config,
      streams: this.streams,
      webviewHost: this.webviewHost,
    })
    this.eventHandler = new RaccoonEventHandler({
      directory: () => this.directory(),
      getState: () => this.state,
      setState: (state) => {
        this.state = state
      },
      post: () => this.post(),
      upsertSession: (session) => this.upsertSession(session),
      removeSession: (sessionID) => this.removeSession(sessionID),
      upsertMessage: (message) => this.upsertMessage(message),
      removeMessage: (messageID) => this.removeMessage(messageID),
      hasMessage: (messageID) => this.hasMessage(messageID),
      upsertPart: (part) => this.upsertPart(part),
      removePart: (messageID, partID) => this.removePart(messageID, partID),
      pushPartUpdate: (part) => this.pushPartUpdate(part),
      pushPartDelta: (messageID, partID, field, delta) => this.pushPartDelta(messageID, partID, field, delta),
      flushStreams: () => this.streams.flush(),
      stopPromptRefresh: (sessionID) => this.sessions.stopPromptRefresh(sessionID),
      clearPromptRefresh: (sessionID) => this.sessions.clearPromptRefresh(sessionID),
      scheduleEventRefresh: () => this.scheduleEventRefresh(),
      refreshMcpInstalled: () => this.refreshMcpInstalled(),
      postMessage: (message) => this.webviewHost.post("chat", message),
      onReauthRequired: () => this.handleReauthRequired(),
    })
    this.eventStream = new RaccoonEventStream(() => this.client(), (event) => this.eventHandler.handleGlobal(event), (message) =>
      this.output.appendLine(message),
    )
    this.messageRouter = new RaccoonMessageRouter({
      markReady: (source) => this.webviewHost.markReady(source),
      createSession: (mode) => this.createSession(mode),
      refresh: () => this.refresh(),
      openHistory: () => this.openHistory(),
      openSettings: () => this.openSettings(),
      closeSettings: () => this.webviewHost.closeSettings(),
      selectSession: (sessionID) => this.selectSession(sessionID),
      renameSession: (sessionID, title) => this.renameSession(sessionID, title),
      deleteSession: (sessionID) => this.deleteSession(sessionID),
      exportSession: (sessionID) => this.exportSession(sessionID),
      revertSession: (sessionID, messageID, source) => this.sessions.revertSession(sessionID, messageID, source),
      unrevertSession: (sessionID, source) => this.sessions.unrevertSession(sessionID, source),
      runSlashCommand: (name, source) => this.sessions.runSlashCommand(name, source),
      setMode: (mode) => this.config.setMode(mode),
      setPluginLanguage: (language) => this.config.setPluginLanguage(language),
      setAutocompleteEnabled: (enabled) => this.setAutocompleteEnabled(enabled),
      setModel: (model) => this.config.setModel(model),
      setModeModel: (mode, model) => this.config.setModeModel(mode, model),
      setModelEnabled: (model, enabled) => this.config.setModelEnabled(model, enabled),
      setProviderEnabled: (providerID, enabled) => this.config.setProviderEnabled(providerID, enabled),
      loginRaccoon: (serverUrl, source) => this.config.loginRaccoon(serverUrl, source),
      cancelRaccoonLogin: () => this.config.cancelRaccoonLogin(),
      logoutRaccoon: () => this.logoutRaccoon(),
      configureProvider: (providerID, apiKey) => this.config.configureProvider(providerID, apiKey),
      configureAgent: (message) => this.config.configureAgent(message),
      deleteAgent: (name, scope) => this.config.deleteAgent(name, scope),
      saveRule: (message) => this.rules.saveRule(message),
      toggleRule: (message) => this.rules.toggleRule(message.scope, message.name, message.enabled),
      deleteRule: (message) => this.rules.deleteRule(message.scope, message.name),
      connectProvider: (message) => this.config.connectProvider(message),
      cancelProviderConnect: (providerID) => this.config.cancelProviderConnect(providerID),
      disconnectProvider: (providerID) => this.config.disconnectProvider(providerID),
      fetchCustomProviderModels: (message, source) => this.fetchCustomProviderModels(message, source),
      fetchMcpMarketplace: (force, source) => this.fetchMcpMarketplace(force, source),
      installMcpMarketplaceItem: (message, source) => this.installMcpMarketplaceItem(message, source),
      removeMcpMarketplaceItem: (message, source) => this.removeMcpMarketplaceItem(message, source),
      addMcpServerManual: (message, source) => this.addMcpServerManual(message, source),
      fetchMcpInstalled: (source) => this.fetchMcpInstalled(source),
      setMcpServerEnabled: (message, source) => this.setMcpServerEnabled(message, source),
      connectMcpServer: (message, source) => this.connectMcpServer(message, source),
      disconnectMcpServer: (message, source) => this.disconnectMcpServer(message, source),
      removeMcpServer: (message, source) => this.removeMcpServer(message, source),
      updateMcpServer: (message, source) => this.updateMcpServer(message, source),
      configureCustomProvider: (message) => this.config.configureCustomProvider(message),
      requestFileSearch: (requestID, query, kind) => this.requestFileSearch(requestID, query, kind),
      openFile: (filePath, line, column) => this.openFile(filePath, line, column),
      openImage: (url, filename, mime) => this.openImage(url, filename, mime),
      requestTerminalContext: (requestID, source) => this.requestTerminalContext(requestID, source),
      requestGitChangesContext: (requestID, source) => this.requestGitChangesContext(requestID, source),
      questionReply: (message) => this.sessions.questionReply(message),
      questionReject: (message) => this.sessions.questionReject(message),
      permissionReply: (message) => this.sessions.permissionReply(message),
      deleteCustomProvider: (providerID) => this.config.deleteCustomProvider(providerID),
      stopSession: () => this.sessions.stopSession(),
      sendMessage: (text, mode, model, files) => this.sessions.sendMessage(text, mode, model, files),
    })
  }

  async resolveWebviewView(view: vscode.WebviewView) {
    this.webviewHost.resolveChatView(view)
  }

  async createSession(mode: ChatMode = this.state.mode) {
    await this.sessions.createSession(mode)
  }

  async refresh() {
    await this.sessions.refresh()
    this.state = { ...this.state, serverUrl: this.connection.getServerConfig()?.baseUrl, directory: this.directory() }
    this.post()
  }

  private reauthInFlight = false
  private async handleReauthRequired() {
    if (this.reauthInFlight) return
    const connected = this.state.providers.some((entry) => entry.id === "raccoon" && entry.connected)
    if (!connected) return
    this.reauthInFlight = true
    try {
      await this.config.logoutRaccoon()
      await this.refresh()
    } catch (error) {
      this.report(error)
    } finally {
      this.reauthInFlight = false
    }
  }

  // Manual sign-out from the settings panel: close the standalone settings tab so the
  // user isn't left staring at a login form inside a "Raccoon Settings" tab, then
  // refresh so the sidebar falls back to the login screen.
  async logoutRaccoon() {
    await this.withLoading(async () => {
      await this.config.logoutRaccoon()
      this.webviewHost.closeSettings()
      await this.refresh()
    })
  }

  async selectSession(sessionID: string) {
    await this.sessions.selectSession(sessionID)
  }

  async renameSession(sessionID: string, title: string) {
    await this.sessions.renameSession(sessionID, title)
  }

  async deleteSession(sessionID: string) {
    await this.sessions.deleteSession(sessionID)
  }

  async exportSession(sessionID: string) {
    await this.sessions.exportSession(sessionID)
  }

  private async requestFileSearch(requestID: string, query: string, kind?: "file" | "folder") {
    const result = await searchFiles({ query, kind })
    this.webviewHost.post("chat", {
      type: "fileSearchResult",
      requestID,
      items: result.items,
      workspaceDir: result.workspaceDir,
    })
  }

  async openHistory() {
    await this.refresh()
    this.sessions.openHistory()
  }

  async openSettings() {
    await this.refresh()
    this.sessions.openSettings()
  }

  async appendEditorContext(type: "ADD_TO_CONTEXT") {
    const context = getEditorContext()
    if (!context) return
    await vscode.commands.executeCommand("workbench.view.extension.raccoon")
    this.webviewHost.post("chat", {
      type: "appendPrompt",
      text: createPrompt(type, context, this.state.pluginLanguage),
      replace: type !== "ADD_TO_CONTEXT",
    })
  }

  async sendEditorContext(type: "EXPLAIN" | "FIX" | "IMPROVE") {
    const context = getEditorContext()
    if (!context) return
    await this.sendContextPrompt(type, context)
  }

  async sendDocumentRangeContext(type: EditorContextAction, uri: vscode.Uri, range: vscode.Range) {
    const document = await vscode.workspace.openTextDocument(uri)
    const context = createEditorContext(document, range)
    if (!context) return
    await this.sendContextPrompt(type, context)
  }

  private async sendContextPrompt(type: EditorContextAction, context: ReturnType<typeof createEditorContext>) {
    if (!context) return
    await vscode.commands.executeCommand("workbench.view.extension.raccoon")
    if (!this.state.activeSessionID) {
      await this.sessions.createSession(this.state.mode)
    }
    await this.sessions.sendMessage(createPrompt(type, context, this.state.pluginLanguage), this.state.mode, this.state.selectedModel)
  }

  async setAutocompleteEnabled(enabled: boolean) {
    await vscode.workspace
      .getConfiguration("raccoon.autocomplete")
      .update("enableAutoTrigger", enabled, vscode.ConfigurationTarget.Global)
    this.state = { ...this.state, autocompleteEnabled: enabled }
    this.post()
  }

  getState() {
    return this.state
  }

  onDidChangeState(listener: () => void) {
    return this.didChangeState.event(listener)
  }

  private async handle(message: WebviewToExtension, source: RaccoonWebviewSource) {
    try {
      await this.messageRouter.handle(message, source)
    } catch (error) {
      this.report(error)
    }
  }

  private async requestTerminalContext(requestID: string, source: RaccoonWebviewSource) {
    try {
      this.webviewHost.post(source, {
        type: "terminalContextResult",
        requestID,
        content: await terminalContext(),
      } satisfies ExtensionToWebview)
    } catch (error) {
      this.webviewHost.post(source, {
        type: "terminalContextError",
        requestID,
        error: error instanceof Error ? error.message : String(error),
      } satisfies ExtensionToWebview)
    }
  }

  private async requestGitChangesContext(requestID: string, source: RaccoonWebviewSource) {
    try {
      this.webviewHost.post(source, {
        type: "gitChangesContextResult",
        requestID,
        content: await gitChangesContext(this.directory()),
      } satisfies ExtensionToWebview)
    } catch (error) {
      this.webviewHost.post(source, {
        type: "gitChangesContextError",
        requestID,
        error: error instanceof Error ? error.message : String(error),
      } satisfies ExtensionToWebview)
    }
  }

  private async client() {
    return this.connection.getClientAsync(this.directory())
  }

  private async ensureEventStream() {
    await this.eventStream.ensure(this.directory())
  }

  private async stopEventStream() {
    this.sessions.clearEventRefreshTimer()
    await this.eventStream.stop()
  }

  private scheduleEventRefresh() {
    this.sessions.scheduleEventRefresh()
  }

  private upsertMessage(message: Message) {
    this.state = { ...this.state, messages: upsertSessionMessage(this.state.messages, message) }
  }

  private upsertSession(session: Session) {
    const next = upsertSessionState(this.state.sessions, this.state.activeSessionID, this.state.activeSession, session)
    this.state = { ...this.state, sessions: next.sessions, activeSession: next.activeSession }
  }

  private removeSession(sessionID: string) {
    const next = removeSessionState(
      this.state.sessions,
      this.state.activeSessionID,
      this.state.activeSession,
      this.state.messages,
      sessionID,
    )
    this.state = { ...this.state, ...next }
  }

  private upsertPart(part: Part) {
    this.state = { ...this.state, messages: upsertSessionPart(this.state.messages, part, this.pendingPartDeltas) }
  }

  private removePart(messageID: string, partID: string) {
    this.state = { ...this.state, messages: removeSessionPart(this.state.messages, messageID, partID) }
  }

  private appendPartDelta(messageID: string, partID: string, field: string, delta: string) {
    if (field !== "text") return
    const found = this.state.messages.some((message) => message.id === messageID)
    if (!found) {
      this.pendingPartDeltas.set(partID, `${this.pendingPartDeltas.get(partID) ?? ""}${delta}`)
      this.scheduleEventRefresh()
      return
    }
    const hasPart = this.state.messages.some((message) => message.id === messageID && message.parts?.some((part) => part.id === partID))
    if (!hasPart) {
      this.pendingPartDeltas.set(partID, `${this.pendingPartDeltas.get(partID) ?? ""}${delta}`)
      this.scheduleEventRefresh()
      return
    }
    this.state = {
      ...this.state,
      messages: this.state.messages.map((message) => {
        if (message.id !== messageID) return message
        const parts = (message.parts ?? []).map((part) =>
          part.id === partID ? { ...part, text: `${part.text ?? ""}${delta}` } : part,
        )
        return {
          ...message,
          parts,
          text: messageText(parts),
        }
      }),
    }
  }

  private pushPartUpdate(part: Part) {
    this.streams.push({
      messageID: part.messageID,
      part: mapPart(part),
    })
  }

  private pushPartDelta(messageID: string, partID: string, field: string, delta: string) {
    this.appendPartDelta(messageID, partID, field, delta)
    if (field !== "text") return
    this.streams.push({
      messageID,
      part: { id: partID, type: "text", text: "" },
      delta: {
        type: "text-delta",
        textDelta: delta,
      },
    })
  }

  private hasMessage(messageID: string) {
    return this.state.messages.some((message) => message.id === messageID)
  }

  private removeMessage(messageID: string) {
    this.state = { ...this.state, messages: this.state.messages.filter((message) => message.id !== messageID) }
  }

  private directory() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()
  }

  private openFile(filePath: string, line?: number, column?: number) {
    const uri = this.fileUri(filePath)
    vscode.workspace.openTextDocument(uri).then(
      (document) => {
        const options: vscode.TextDocumentShowOptions = { preview: true }
        if (line !== undefined && line > 0) {
          const position = new vscode.Position(line - 1, column !== undefined && column > 0 ? column - 1 : 0)
          options.selection = new vscode.Range(position, position)
        }
        void vscode.window.showTextDocument(document, options)
      },
      (error) => this.output.appendLine(`Failed to open file ${uri.fsPath}: ${error instanceof Error ? error.message : String(error)}`),
    )
  }

  private async openImage(url: string, filename?: string, mime?: string) {
    try {
      if (url.startsWith("file://")) {
        await vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(url), { preview: true })
        return
      }

      if (!url.startsWith("data:")) return

      const match = url.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/)
      if (!match) return

      const mediaType = mime ?? match[1] ?? "image/png"
      const extension = imageExtension(filename, mediaType)
      const safeName = (filename ?? `raccoon-image-${Date.now()}${extension}`).replace(/[\\/:"*?<>|]+/g, "-")
      const uri = vscode.Uri.joinPath(this.storageUri, "image-preview", safeName.includes(".") ? safeName : `${safeName}${extension}`)
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.storageUri, "image-preview"))
      await vscode.workspace.fs.writeFile(uri, Buffer.from(decodeURIComponent(match[2] ?? ""), url.includes(";base64,") ? "base64" : "utf8"))
      await vscode.commands.executeCommand("vscode.open", uri, { preview: true })
    } catch (error) {
      this.output.appendLine(`Failed to open image: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private fileUri(filePath: string) {
    if (isAbsolutePath(filePath)) return vscode.Uri.file(filePath)
    const directory = this.directory()
    const base = vscode.Uri.file(directory)
    const normalized = filePath.replace(/\\/g, "/").replace(/^\.?\//, "")
    const directoryParts = directory.replace(/\\/g, "/").split("/").filter(Boolean)
    const fileParts = normalized.split("/").filter(Boolean)
    const overlap = fileParts
      .map((_, index) => index + 1)
      .reverse()
      .find(
        (length) =>
          length < fileParts.length &&
          length <= directoryParts.length &&
          fileParts.slice(0, length).join("/") === directoryParts.slice(-length).join("/"),
      )
    return vscode.Uri.joinPath(base, overlap ? fileParts.slice(overlap).join("/") : normalized)
  }

  private async withLoading(run: () => Promise<void>) {
    this.state = { ...this.state, loading: true, busy: true, error: undefined }
    this.post()
    await run()
  }

  private post() {
    this.streams.flush()
    this.didChangeState.fire()
    this.webviewHost.postState(this.state)
  }

  private async fetchCustomProviderModels(
    message: Extract<WebviewToExtension, { type: "fetchCustomProviderModels" }>,
    source: RaccoonWebviewSource,
  ) {
    try {
      const models = await fetchOpenAIModels({ baseURL: message.baseURL.trim(), apiKey: message.apiKey?.trim() || undefined })
      this.webviewHost.post(source, {
        type: "customProviderModelsFetched",
        requestID: message.requestID,
        models,
      } satisfies ExtensionToWebview)
    } catch (error) {
      this.webviewHost.post(source, {
        type: "customProviderModelsFetched",
        requestID: message.requestID,
        error: error instanceof Error ? error.message : "Failed to fetch models",
        auth: error instanceof FetchModelsError && error.auth,
      } satisfies ExtensionToWebview)
    }
  }

  private async fetchMcpMarketplace(_force: boolean | undefined, source: RaccoonWebviewSource) {
    this.state = {
      ...this.state,
      mcpMarketplace: {
        items: this.state.mcpMarketplace?.items ?? [],
        installed: this.state.mcpMarketplace?.installed ?? { project: {}, user: {} },
        loading: true,
        errors: undefined,
        lastFetchedAt: this.state.mcpMarketplace?.lastFetchedAt,
      },
    }
    this.post()
    try {
      const data = await this.marketplace.fetchData(await this.client(), this.directory())
      this.state = {
        ...this.state,
        mcpMarketplace: {
          items: data.items,
          installed: data.installed,
          loading: false,
          errors: data.errors,
          lastFetchedAt: Date.now(),
        },
      }
      this.post()
      this.webviewHost.post(source, { type: "mcpMarketplaceData", ...data } satisfies ExtensionToWebview)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const mcpMarketplace = {
        items: this.state.mcpMarketplace?.items ?? [],
        installed: this.state.mcpMarketplace?.installed ?? { project: {}, user: {} },
        loading: false,
        errors: [message],
        lastFetchedAt: this.state.mcpMarketplace?.lastFetchedAt,
      }
      this.state = {
        ...this.state,
        mcpMarketplace,
      }
      this.post()
      this.webviewHost.post(source, {
        type: "mcpMarketplaceData",
        items: mcpMarketplace.items,
        installed: mcpMarketplace.installed,
        errors: [message],
      } satisfies ExtensionToWebview)
    }
  }

  private async installMcpMarketplaceItem(
    message: Extract<WebviewToExtension, { type: "installMcpMarketplaceItem" }>,
    source: RaccoonWebviewSource,
  ) {
    try {
      const result = await this.marketplace.install(await this.client(), this.directory(), message.item, message.options)
      this.webviewHost.post(source, { type: "mcpMarketplaceInstallResult", ...result } satisfies ExtensionToWebview)
      if (!result.success) return
      await this.refresh()
      await this.fetchMcpMarketplace(false, source)
    } catch (error) {
      this.webviewHost.post(source, {
        type: "mcpMarketplaceInstallResult",
        id: message.item.id,
        scope: message.options.scope,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies ExtensionToWebview)
    }
  }

  private async removeMcpMarketplaceItem(
    message: Extract<WebviewToExtension, { type: "removeMcpMarketplaceItem" }>,
    source: RaccoonWebviewSource,
  ) {
    try {
      const result = await this.marketplace.remove(await this.client(), this.directory(), message.item, message.scope)
      this.webviewHost.post(source, { type: "mcpMarketplaceRemoveResult", ...result } satisfies ExtensionToWebview)
      if (!result.success) return
      await this.refresh()
      await this.fetchMcpMarketplace(false, source)
    } catch (error) {
      this.webviewHost.post(source, {
        type: "mcpMarketplaceRemoveResult",
        id: message.item.id,
        scope: message.scope,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies ExtensionToWebview)
    }
  }

  private async addMcpServerManual(
    message: Extract<WebviewToExtension, { type: "addMcpServerManual" }>,
    source: RaccoonWebviewSource,
  ) {
    try {
      const result = await this.marketplace.installManual(await this.client(), this.directory(), {
        id: message.id,
        config: message.config,
        scope: message.scope,
      })
      this.webviewHost.post(source, { type: "mcpManualAddResult", ...result } satisfies ExtensionToWebview)
      if (!result.success) return
      await this.refresh()
      await this.fetchMcpMarketplace(false, source)
    } catch (error) {
      this.webviewHost.post(source, {
        type: "mcpManualAddResult",
        id: message.id,
        scope: message.scope,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies ExtensionToWebview)
    }
  }

  private async fetchMcpInstalled(source: RaccoonWebviewSource) {
    this.state = {
      ...this.state,
      mcpInstalled: {
        servers: this.state.mcpInstalled?.servers ?? [],
        loading: true,
        error: undefined,
      },
    }
    this.post()
    try {
      const withStatus = await this.loadMcpInstalled()
      this.state = {
        ...this.state,
        mcpInstalled: { servers: withStatus, loading: false, error: undefined },
      }
      this.post()
      this.webviewHost.post(source, { type: "mcpInstalledData", servers: withStatus } satisfies ExtensionToWebview)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.state = {
        ...this.state,
        mcpInstalled: { servers: this.state.mcpInstalled?.servers ?? [], loading: false, error: message },
      }
      this.post()
      this.webviewHost.post(source, {
        type: "mcpInstalledData",
        servers: this.state.mcpInstalled?.servers ?? [],
        error: message,
      } satisfies ExtensionToWebview)
    }
  }

  // Triggered by the mcp.tools.changed event. Only refreshes when the Installed
  // panel has already been opened, and broadcasts to every webview.
  private async refreshMcpInstalled() {
    if (!this.state.mcpInstalled) return
    try {
      const withStatus = await this.loadMcpInstalled()
      this.state = {
        ...this.state,
        mcpInstalled: { servers: withStatus, loading: false, error: undefined },
      }
      this.post()
    } catch (error) {
      this.report(error)
    }
  }

  private async loadMcpInstalled() {
    const client = await this.client()
    const directory = this.directory()
    const [servers, status] = await Promise.all([
      this.marketplace.listInstalled(client, directory),
      this.marketplace.status(client, directory).catch(() => ({}) as Record<string, McpStatus>),
    ])
    return servers.map((server) => ({ ...server, status: status[server.id] }))
  }

  private async setMcpServerEnabled(
    message: Extract<WebviewToExtension, { type: "setMcpServerEnabled" }>,
    source: RaccoonWebviewSource,
  ) {
    await this.runMcpServerAction(message.id, source, async () => {
      await this.marketplace.setEnabled(await this.client(), this.directory(), message.id, message.scope, message.enabled)
    })
  }

  private async connectMcpServer(
    message: Extract<WebviewToExtension, { type: "connectMcpServer" }>,
    source: RaccoonWebviewSource,
  ) {
    await this.runMcpServerAction(message.id, source, async () => {
      await this.marketplace.connect(await this.client(), this.directory(), message.id)
    })
  }

  private async disconnectMcpServer(
    message: Extract<WebviewToExtension, { type: "disconnectMcpServer" }>,
    source: RaccoonWebviewSource,
  ) {
    await this.runMcpServerAction(message.id, source, async () => {
      await this.marketplace.disconnect(await this.client(), this.directory(), message.id)
    })
  }

  private async removeMcpServer(
    message: Extract<WebviewToExtension, { type: "removeMcpServer" }>,
    source: RaccoonWebviewSource,
  ) {
    await this.runMcpServerAction(message.id, source, async () => {
      await this.marketplace.removeById(await this.client(), this.directory(), message.id, message.scope)
    })
  }

  private async updateMcpServer(
    message: Extract<WebviewToExtension, { type: "updateMcpServer" }>,
    source: RaccoonWebviewSource,
  ) {
    await this.runMcpServerAction(message.id, source, async () => {
      const result = await this.marketplace.updateConfig(
        await this.client(),
        this.directory(),
        message.id,
        message.scope,
        message.config,
      )
      if (!result.success) throw new Error(result.error ?? "Failed to update MCP server")
    })
  }

  private async runMcpServerAction(id: string, source: RaccoonWebviewSource, action: () => Promise<unknown>) {
    try {
      await action()
      this.webviewHost.post(source, { type: "mcpServerActionResult", id, success: true } satisfies ExtensionToWebview)
      await this.refresh()
      await this.fetchMcpInstalled(source)
    } catch (error) {
      this.webviewHost.post(source, {
        type: "mcpServerActionResult",
        id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies ExtensionToWebview)
    }
  }

  private report(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    this.output.appendLine(message)
    this.state = { ...this.state, loading: false, busy: false, error: message }
    this.didChangeState.fire()
    this.webviewHost.postError(message)
  }

  private onConnectionState(state: ConnectionState) {
    if (state === "connecting") {
      this.state = { ...this.state, loading: true, busy: true, error: undefined }
      this.post()
      return
    }
    if (state === "connected") {
      this.state = {
        ...this.state,
        loading: false,
        busy: false,
        error: undefined,
        serverUrl: this.connection.getServerConfig()?.baseUrl,
        directory: this.directory(),
      }
      this.post()
      return
    }
    if (state === "error" || state === "disconnected") {
      this.state = { ...this.state, loading: false, busy: false, error: `Backend ${state}` }
      this.post()
    }
  }

  dispose() {
    this.unsubscribeState?.()
    this.autocompleteConfigListener.dispose()
    this.sessions.dispose()
    this.streams.dispose()
    this.marketplace.dispose()
    void this.stopEventStream()
    this.didChangeState.dispose()
  }
}
