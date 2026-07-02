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
  RaccoonState,
  WebviewToExtension,
} from "@opencode-ai/raccoon-webview"
import { RaccoonConnectionService, type ConnectionState } from "./services/cli-backend/index.js"
import {
  mapPart,
  messageText,
} from "./raccoon-provider/mapping.js"
import { gitChangesContext, terminalContext } from "./raccoon-provider/context-mentions.js"
import { searchFiles } from "./raccoon-provider/file-search.js"
import {
  removePart as removeSessionPart,
  removeSession as removeSessionState,
  upsertMessage as upsertSessionMessage,
  upsertPart as upsertSessionPart,
  upsertSession as upsertSessionState,
} from "./raccoon-provider/session-state.js"
import { FetchModelsError, fetchOpenAIModels } from "./raccoon-provider/openai-models.js"
import { RaccoonStreamScheduler } from "./raccoon-provider/stream-scheduler.js"
import { RaccoonEventStream } from "./raccoon-provider/event-stream.js"
import { RaccoonEventHandler } from "./raccoon-provider/event-handler.js"
import { RaccoonMessageRouter } from "./raccoon-provider/message-router.js"
import { RaccoonProviderConfig } from "./raccoon-provider/provider-config.js"
import { RaccoonSessionController } from "./raccoon-provider/session-controller.js"
import { RaccoonWebviewHost, type RaccoonWebviewSource } from "./raccoon-provider/webview-host.js"

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

export class RaccoonProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "raccoon.chat"

  private readonly didChangeState = new vscode.EventEmitter<void>()
  private eventRefreshTimer?: ReturnType<typeof setTimeout>
  private unsubscribeState?: () => void
  private readonly pendingPartDeltas = new Map<string, string>()
  private readonly streams = new RaccoonStreamScheduler((message) => this.webviewHost.post("chat", message))
  private readonly webviewHost: RaccoonWebviewHost
  private readonly eventStream: RaccoonEventStream
  private readonly eventHandler: RaccoonEventHandler
  private readonly messageRouter: RaccoonMessageRouter
  private readonly config: RaccoonProviderConfig
  private readonly sessions: RaccoonSessionController
  private state: RaccoonState = {
    sessions: [],
    messages: [],
    models: [],
    providers: [],
    agents: [],
    mode: "build",
    loading: true,
  }

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly connection: RaccoonConnectionService,
    private readonly output: vscode.OutputChannel,
    private readonly storage?: vscode.Memento,
  ) {
    this.unsubscribeState = this.connection.onStateChange((state) => this.onConnectionState(state))
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
    })
    this.state = { ...this.state, ...this.config.initialState() }
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
      setModel: (model) => this.config.setModel(model),
      setModeModel: (mode, model) => this.config.setModeModel(mode, model),
      setModelEnabled: (model, enabled) => this.config.setModelEnabled(model, enabled),
      setProviderEnabled: (providerID, enabled) => this.config.setProviderEnabled(providerID, enabled),
      loginRaccoon: (serverUrl, source) => this.config.loginRaccoon(serverUrl, source),
      cancelRaccoonLogin: () => this.config.cancelRaccoonLogin(),
      configureProvider: (providerID, apiKey) => this.config.configureProvider(providerID, apiKey),
      connectProvider: (message) => this.config.connectProvider(message),
      cancelProviderConnect: (providerID) => this.config.cancelProviderConnect(providerID),
      fetchCustomProviderModels: (message, source) => this.fetchCustomProviderModels(message, source),
      configureCustomProvider: (message) => this.config.configureCustomProvider(message),
      requestFileSearch: (requestID, query, kind) => this.requestFileSearch(requestID, query, kind),
      openFile: (filePath, line, column) => this.openFile(filePath, line, column),
      requestTerminalContext: (requestID, source) => this.requestTerminalContext(requestID, source),
      requestGitChangesContext: (requestID, source) => this.requestGitChangesContext(requestID, source),
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
    const uri = isAbsolutePath(filePath)
      ? vscode.Uri.file(filePath)
      : vscode.Uri.joinPath(vscode.Uri.file(this.directory()), filePath)
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
    if (state === "error" || state === "disconnected") {
      this.state = { ...this.state, loading: false, busy: false, error: `Backend ${state}` }
      this.post()
    }
  }

  dispose() {
    this.unsubscribeState?.()
    this.sessions.dispose()
    this.streams.dispose()
    void this.stopEventStream()
    this.didChangeState.dispose()
  }
}
