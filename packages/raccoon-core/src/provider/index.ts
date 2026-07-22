import {
  type Message,
  type OpencodeClient,
  type Part,
  type Session,
} from "@opencode-ai/sdk/v2/client"
import type {
  ChatMode,
  ExtensionToWebview,
  RaccoonFileSearchItem,
  RaccoonMessage,
  RaccoonPluginLanguage,
  RaccoonState,
  WebviewToExtension,
} from "@opencode-ai/raccoon-webview"
import { MarketplaceService } from "../services/marketplace/index.js"
import type { McpStatus } from "../services/marketplace/index.js"
import { SkillMarketplaceService } from "../services/skill-marketplace/index.js"
import {
  mapPart,
  messageText,
} from "./message/mapping.js"
import { createPrompt } from "./editor/editor-prompt.js"
import {
  removePart as removeSessionPart,
  removeSession as removeSessionState,
  upsertMessage as upsertSessionMessage,
  upsertPart as upsertSessionPart,
  upsertSession as upsertSessionState,
} from "./session/session-state.js"
import { FetchModelsError, fetchOpenAIModels } from "./editor/openai-models.js"
import { RaccoonStreamScheduler } from "./stream/stream-scheduler.js"
import { RaccoonEventStream } from "./stream/event-stream.js"
import { RaccoonEventHandler } from "./stream/event-handler.js"
import { RaccoonMessageRouter } from "./stream/message-router.js"
import { RaccoonProviderConfig } from "./config/provider-config.js"
import { RaccoonRulesConfig } from "./config/rules-config.js"
import { RaccoonCommandsConfig } from "./config/commands-config.js"
import { RaccoonSessionController } from "./session/session-controller.js"
import type {
  ConnectionPort,
  ConnectionState,
  Disposable,
  DocumentRangeRef,
  EditorContext,
  EditorContextAction,
  Emitter,
  HostPlatform,
  RaccoonWebviewSource,
  WebviewTransport,
} from "./platform.js"

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

// Subsequence fuzzy match used to filter open editor tabs against the mention query.
// Empty query matches everything so all open tabs are pinned when the popover first opens.
function fuzzyMatch(query: string, target: string): boolean {
  const q = query.trim().replaceAll("\\", "/").toLowerCase()
  if (!q) return true
  const t = target.toLowerCase()
  if (t.includes(q)) return true
  let index = -1
  for (const char of q) {
    index = t.indexOf(char, index + 1)
    if (index === -1) return false
  }
  return true
}

export class RaccoonProvider {
  static readonly viewType = "raccoon.chat"

  private readonly didChangeState: Emitter<void>
  private eventRefreshTimer?: ReturnType<typeof setTimeout>
  private unsubscribeState?: () => void
  private readonly autocompleteConfigListener: Disposable
  private readonly pendingPartDeltas = new Map<string, string>()
  private readonly streams = new RaccoonStreamScheduler((message) => this.webviewHost.post("chat", message))
  private readonly webviewHost: WebviewTransport
  private readonly eventStream: RaccoonEventStream
  private readonly eventHandler: RaccoonEventHandler
  private readonly messageRouter: RaccoonMessageRouter
  private readonly config: RaccoonProviderConfig
  private readonly rules: RaccoonRulesConfig
  private readonly commands: RaccoonCommandsConfig
  private readonly sessions: RaccoonSessionController
  private readonly marketplace: MarketplaceService
  private readonly skillMarketplace: SkillMarketplaceService
  private state: RaccoonState = {
    sessions: [],
    messages: [],
    agents: [],
    models: [],
    providers: [],
    mode: "build",
    loading: true,
    pluginLanguageMode: "auto",
    pluginLanguage: "en",
    autocompleteEnabled: true,
  }

  constructor(
    private readonly connection: ConnectionPort,
    private readonly platform: HostPlatform,
    transport: WebviewTransport,
  ) {
    this.webviewHost = transport
    this.marketplace = new MarketplaceService((message) => this.platform.ui.showInfo(message))
    this.skillMarketplace = new SkillMarketplaceService((message) => this.platform.ui.showInfo(message))
    this.state = {
      ...this.state,
      pluginLanguage: normalizePluginLanguage(this.platform.env.locale()),
      autocompleteEnabled: this.platform.settings.getAutocompleteEnabled(),
    }
    this.didChangeState = this.platform.createEmitter<void>()
    this.unsubscribeState = this.connection.onStateChange((state) => this.onConnectionState(state))
    this.autocompleteConfigListener = this.platform.settings.onAutocompleteEnabledChange((enabled) => {
      if (enabled === this.state.autocompleteEnabled) return
      this.state = { ...this.state, autocompleteEnabled: enabled }
      this.post()
    })
    this.webviewHost.onMessage((message, source) => void this.handle(message, source))
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
      storage: this.platform.storage,
      webviewHost: this.webviewHost,
      openExternal: (url) => this.platform.ui.openExternal(url),
      promptInput: (options) => this.platform.ui.promptInput(options),
      pluginLanguage: () => normalizePluginLanguage(this.platform.env.locale()),
    })
    this.state = { ...this.state, ...this.config.initialState() }
    this.rules = new RaccoonRulesConfig({
      client: () => this.client(),
      directory: () => this.directory(),
      refresh: () => this.refresh(),
    })
    this.commands = new RaccoonCommandsConfig({
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
      log: (message) => this.platform.ui.log(message),
      saveFile: (options) => this.platform.ui.saveFile(options),
      captureTerminal: () => this.platform.editor.terminalContext(),
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
      pushSubAgentPartDelta: (messageID, partID, field, delta) => this.pushSubAgentPartDelta(messageID, partID, field, delta),
      upsertSubAgentMessage: (message) => this.upsertSubAgentMessage(message),
      flushStreams: () => this.streams.flush(),
      stopPromptRefresh: (sessionID) => this.sessions.stopPromptRefresh(sessionID),
      clearPromptRefresh: (sessionID) => this.sessions.clearPromptRefresh(sessionID),
      scheduleEventRefresh: () => this.scheduleEventRefresh(),
      scheduleSubAgentRefresh: (sessionID) => this.sessions.scheduleSubAgentRefresh(sessionID),
      refreshMcpInstalled: () => this.refreshMcpInstalled(),
      postMessage: (message) => this.webviewHost.post("chat", message),
      onReauthRequired: () => this.handleReauthRequired(),
    })
    this.eventStream = new RaccoonEventStream(
      () => this.client(),
      (event) => this.eventHandler.handleGlobal(event),
      (message) => this.platform.ui.log(message),
      () => this.scheduleEventRefresh(),
    )
    this.messageRouter = new RaccoonMessageRouter({
      markReady: (source) => this.webviewHost.markReady(source),
      postState: () => this.post(),
      createSession: (mode) => this.createSession(mode),
      refresh: () => this.refresh(),
      openHistory: () => this.openHistory(),
      openSettings: () => this.openSettings(),
      closeSettings: () => this.webviewHost.closeSettings(),
      selectSession: (sessionID) => this.selectSession(sessionID),
      openSubAgent: (sessionID, title) => this.sessions.openSubAgent(sessionID, title),
      closeSubAgent: () => this.sessions.closeSubAgent(),
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
      saveCommand: (message) => this.commands.saveCommand(message),
      deleteCommand: (message) => this.commands.deleteCommand(message.scope, message.name),
      connectProvider: (message) => this.config.connectProvider(message),
      cancelProviderConnect: (providerID) => this.config.cancelProviderConnect(providerID),
      disconnectProvider: (providerID) => this.config.disconnectProvider(providerID),
      fetchCustomProviderModels: (message, source) => this.fetchCustomProviderModels(message, source),
      fetchMcpMarketplace: (force, source) => this.fetchMcpMarketplace(force, source),
      fetchSkillMarketplace: (force, source) => this.fetchSkillMarketplace(force, source),
      installMcpMarketplaceItem: (message, source) => this.installMcpMarketplaceItem(message, source),
      removeMcpMarketplaceItem: (message, source) => this.removeMcpMarketplaceItem(message, source),
      installSkillMarketplaceItem: (message, source) => this.installSkillMarketplaceItem(message, source),
      removeSkillMarketplaceItem: (message, source) => this.removeSkillMarketplaceItem(message, source),
      addMcpServerManual: (message, source) => this.addMcpServerManual(message, source),
      fetchMcpInstalled: (source) => this.fetchMcpInstalled(source),
      fetchSkillInstalled: (source) => this.fetchSkillInstalled(source),
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
      sendMessage: (sessionID, text, mode, model, files) => this.sessions.sendMessage(sessionID, text, mode, model, files),
    })
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
    const directory = this.directory()
    const items = this.pinOpenFiles(await this.searchFiles(query, kind), query, kind)
    this.webviewHost.post("chat", {
      type: "fileSearchResult",
      requestID,
      items,
      workspaceDir: directory,
    })
  }

  // Search via the opencode backend (ripgrep cache + fuzzysort); fall back to the host's
  // native editor search when the backend is unavailable (e.g. still connecting).
  private async searchFiles(query: string, kind?: "file" | "folder"): Promise<RaccoonFileSearchItem[]> {
    try {
      const client = await this.client()
      const directory = this.directory()
      if (kind === "file") {
        const res = await client.find.files({ directory, query, type: "file", limit: 100 })
        return (res.data ?? []).map((path) => ({ path, type: "file" as const }))
      }
      if (kind === "folder") {
        const res = await client.find.files({ directory, query, type: "directory", limit: 100 })
        return (res.data ?? []).map((path) => ({ path, type: "folder" as const }))
      }
      const [filesRes, dirsRes] = await Promise.all([
        client.find.files({ directory, query, type: "file", limit: 100 }),
        client.find.files({ directory, query, type: "directory", limit: 100 }),
      ])
      return [
        ...(filesRes.data ?? []).map((path) => ({ path, type: "file" as const })),
        ...(dirsRes.data ?? []).map((path) => ({ path, type: "folder" as const })),
      ]
    } catch {
      const result = await this.platform.editor.searchFiles(query, kind)
      return result.items
    }
  }

  // Promote open editor tabs (active file first) to the top of the result list. Open files
  // are treated as an independent candidate source: any tab whose path fuzzy-matches the
  // query is included, even if the backend didn't return it (limit or ranking cutoff).
  private pinOpenFiles(items: RaccoonFileSearchItem[], query: string, kind?: "file" | "folder"): RaccoonFileSearchItem[] {
    if (kind === "folder") return items
    const openFiles = this.platform.editor.getOpenFiles?.() ?? []
    if (!openFiles.length) return items
    const active = openFiles[0]
    const matched = openFiles.filter((path) => fuzzyMatch(query, path))
    if (!matched.length) return items
    const ordered = active && matched.includes(active) ? [active, ...matched.filter((p) => p !== active)] : matched
    const pinned = new Set(ordered)
    return [
      ...ordered.map((path) => ({ path, type: "opened-file" as const })),
      ...items.filter((item) => !pinned.has(item.path)),
    ]
  }

  async openHistory() {
    await this.refresh()
    this.sessions.openHistory()
  }

  async openSettings() {
    // Opening settings must not refresh(): refresh() runs loadMessages through
    // withLoading (loading:true→false) and fans postState to the chat webview,
    // making the chat surface flash. The settings panel fetches its own data on
    // webviewReady (postState, not refresh).
    this.sessions.openSettings()
  }

  async appendEditorContext() {
    const context = this.platform.editor.getActiveContext()
    if (!context) return
    await this.appendContext(context)
  }

  async appendDocumentRangeContext(ref: DocumentRangeRef) {
    const context = await this.platform.editor.getRangeContext(ref)
    if (!context) return
    await this.appendContext(context)
  }

  private async appendContext(context: EditorContext) {
    await this.platform.ui.revealChat()
    this.webviewHost.post("chat", {
      type: "appendPrompt",
      text: createPrompt("ADD_TO_CONTEXT", context, this.state.pluginLanguage),
      replace: false,
    })
  }

  async sendEditorContext(type: EditorContextAction) {
    const context = this.platform.editor.getActiveContext()
    if (!context) return
    await this.sendContextPrompt(type, context)
  }

  async sendDocumentRangeContext(type: EditorContextAction, ref: DocumentRangeRef) {
    const context = await this.platform.editor.getRangeContext(ref)
    if (!context) return
    await this.sendContextPrompt(type, context)
  }

  private async sendContextPrompt(type: EditorContextAction, context: EditorContext) {
    await this.platform.ui.revealChat()
    if (!this.state.activeSessionID) {
      await this.sessions.createSession(this.state.mode)
    }
    await this.sessions.sendMessage(
      this.state.activeSessionID,
      createPrompt(type, context, this.state.pluginLanguage),
      this.state.mode,
      this.state.selectedModel,
    )
  }

  async setAutocompleteEnabled(enabled: boolean) {
    await this.platform.settings.setAutocompleteEnabled(enabled)
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
        content: await this.platform.editor.terminalContext(),
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
        content: await this.platform.editor.gitChangesContext(this.directory()),
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

  private pushSubAgentPartDelta(messageID: string, partID: string, field: string, delta: string) {
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

  private upsertSubAgentMessage(message: Message) {
    if (message.role !== "user" && message.role !== "assistant") return
    const mapped: RaccoonMessage = {
      id: message.id,
      role: message.role,
      text: "",
      parts: [],
      createdAt: message.time.created,
      ...(message.role === "assistant" ? { tokens: message.tokens, cost: message.cost } : {}),
    }
    this.webviewHost.post("chat", { type: "subAgentMessageUpdated", message: mapped } satisfies ExtensionToWebview)
  }

  private hasMessage(messageID: string) {
    return this.state.messages.some((message) => message.id === messageID)
  }

  private removeMessage(messageID: string) {
    this.state = { ...this.state, messages: this.state.messages.filter((message) => message.id !== messageID) }
  }

  private directory() {
    return this.platform.workspace.directory()
  }

  private openFile(filePath: string, line?: number, column?: number) {
    this.platform.ui.openFile(filePath, this.directory(), line, column)
  }

  private async openImage(url: string, filename?: string, mime?: string) {
    try {
      if (url.startsWith("file://")) {
        await this.platform.ui.openPath(url)
        return
      }

      if (!url.startsWith("data:")) return

      const match = url.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/)
      if (!match) return

      const mediaType = mime ?? match[1] ?? "image/png"
      const extension = imageExtension(filename, mediaType)
      const safeName = (filename ?? `raccoon-image-${Date.now()}${extension}`).replace(/[\\/:"*?<>|]+/g, "-")
      const data = Buffer.from(decodeURIComponent(match[2] ?? ""), url.includes(";base64,") ? "base64" : "utf8")
      const absolutePath = await this.platform.fs.writeTempFile(
        ["image-preview", safeName.includes(".") ? safeName : `${safeName}${extension}`],
        data,
      )
      await this.platform.ui.openPath(absolutePath)
    } catch (error) {
      this.platform.ui.log(`Failed to open image: ${error instanceof Error ? error.message : String(error)}`)
    }
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
      const models = await fetchOpenAIModels({
        baseURL: message.baseURL.trim(),
        apiKey: message.apiKey?.trim() || undefined,
        headers: message.headers,
      })
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

  private async fetchSkillMarketplace(_force: boolean | undefined, source: RaccoonWebviewSource) {
    this.state = {
      ...this.state,
      skillMarketplace: {
        sources: this.state.skillMarketplace?.sources ?? [],
        items: this.state.skillMarketplace?.items ?? [],
        installed: this.state.skillMarketplace?.installed ?? { project: {}, user: {} },
        loading: true,
        errors: undefined,
        lastFetchedAt: this.state.skillMarketplace?.lastFetchedAt,
      },
    }
    this.post()
    try {
      const data = await this.skillMarketplace.fetchData(await this.client(), this.directory())
      this.state = {
        ...this.state,
        skillMarketplace: {
          sources: data.sources,
          items: data.items,
          installed: data.installed,
          loading: false,
          errors: data.errors,
          lastFetchedAt: Date.now(),
        },
      }
      this.post()
      this.webviewHost.post(source, { type: "skillMarketplaceData", ...data } satisfies ExtensionToWebview)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const skillMarketplace = {
        sources: this.state.skillMarketplace?.sources ?? [],
        items: this.state.skillMarketplace?.items ?? [],
        installed: this.state.skillMarketplace?.installed ?? { project: {}, user: {} },
        loading: false,
        errors: [message],
        lastFetchedAt: this.state.skillMarketplace?.lastFetchedAt,
      }
      this.state = {
        ...this.state,
        skillMarketplace,
      }
      this.post()
      this.webviewHost.post(source, {
        type: "skillMarketplaceData",
        sources: skillMarketplace.sources,
        items: skillMarketplace.items,
        installed: skillMarketplace.installed,
        errors: [message],
      } satisfies ExtensionToWebview)
    }
  }

  private async installSkillMarketplaceItem(
    message: Extract<WebviewToExtension, { type: "installSkillMarketplaceItem" }>,
    source: RaccoonWebviewSource,
  ) {
    try {
      const result = await this.skillMarketplace.install(await this.client(), this.directory(), message.item, message.options)
      this.webviewHost.post(source, { type: "skillMarketplaceInstallResult", ...result } satisfies ExtensionToWebview)
      if (!result.success) return
      await this.refresh()
      await this.fetchSkillMarketplace(false, source)
      await this.fetchSkillInstalled(source)
    } catch (error) {
      this.webviewHost.post(source, {
        type: "skillMarketplaceInstallResult",
        id: message.item.id,
        scope: message.options.scope,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies ExtensionToWebview)
    }
  }

  private async removeSkillMarketplaceItem(
    message: Extract<WebviewToExtension, { type: "removeSkillMarketplaceItem" }>,
    source: RaccoonWebviewSource,
  ) {
    try {
      const result = await this.skillMarketplace.remove(await this.client(), this.directory(), message.item, message.scope)
      this.webviewHost.post(source, { type: "skillMarketplaceRemoveResult", ...result } satisfies ExtensionToWebview)
      if (!result.success) return
      await this.refresh()
      await this.fetchSkillMarketplace(false, source)
      await this.fetchSkillInstalled(source)
    } catch (error) {
      this.webviewHost.post(source, {
        type: "skillMarketplaceRemoveResult",
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

  private async fetchSkillInstalled(source: RaccoonWebviewSource) {
    this.state = {
      ...this.state,
      skillInstalled: {
        skills: this.state.skillInstalled?.skills ?? [],
        loading: true,
        error: undefined,
      },
    }
    this.post()
    try {
      const skills = await this.skillMarketplace.listInstalled(await this.client(), this.directory())
      this.state = {
        ...this.state,
        skillInstalled: {
          skills,
          loading: false,
        },
      }
      this.post()
      this.webviewHost.post(source, { type: "skillInstalledData", skills } satisfies ExtensionToWebview)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const skills = this.state.skillInstalled?.skills ?? []
      this.state = {
        ...this.state,
        skillInstalled: {
          skills,
          loading: false,
          error: message,
        },
      }
      this.post()
      this.webviewHost.post(source, {
        type: "skillInstalledData",
        skills,
        error: message,
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
    this.platform.ui.log(message)
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
