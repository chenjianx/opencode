import type { FilePartInput, OpencodeClient, Session } from "@opencode-ai/sdk/v2/client"
import type {
  ChatMode,
  ExtensionToWebview,
  RaccoonMessagePart,
  RaccoonState,
  RaccoonSubAgentView,
  RaccoonSubSession,
  WebviewToExtension,
} from "@opencode-ai/raccoon-webview"
import { uiSlashCommands } from "../config/commands.js"
import { contextMentionAttachments } from "../editor/context-mentions.js"
import { exportMarkdown } from "../message/export-markdown.js"
import { ascendingID } from "../message/ids.js"
import { contextInspectorSnapshot } from "../message/context-inspector.js"
import { mapMessage, mapSession, mapSessionV2, mapSubSession, responseText, sortMessages, sortSessions } from "../message/mapping.js"
import type { ModelSelection } from "./model-state.js"
import type { RaccoonProviderConfig } from "../config/provider-config.js"
import type { RaccoonStreamScheduler } from "../stream/stream-scheduler.js"
import type { RaccoonWebviewSource, WebviewTransport } from "../platform.js"

type SessionControllerDeps = {
  client: () => Promise<OpencodeClient>
  directory: () => string
  getState: () => RaccoonState
  setState: (state: RaccoonState) => void
  post: () => void
  withLoading: (run: () => Promise<void>) => Promise<void>
  ensureEventStream: () => Promise<void>
  loadModels: (client?: OpencodeClient) => Promise<void>
  removeSession: (sessionID: string) => void
  report: (error: unknown) => void
  log: (message: string) => void
  saveFile: (options: {
    title: string
    saveLabel?: string
    defaultName: string
    directory: string
    filters?: Record<string, string[]>
    data: Uint8Array
  }) => Promise<boolean>
  captureTerminal: () => Promise<string>
  config: RaccoonProviderConfig
  streams: RaccoonStreamScheduler
  webviewHost: WebviewTransport
}

type SubAgentLoad = {
  sessionID: string
  generation: number
  events: ExtensionToWebview[]
}

export class RaccoonSessionController {
  private eventRefreshTimer?: ReturnType<typeof setTimeout>
  private promptRefreshTimer?: ReturnType<typeof setTimeout>
  private subAgentRefreshTimer?: ReturnType<typeof setTimeout>
  private refreshingFromEvent = false
  private refreshingSubAgent = false
  private subAgentRefreshPending = false
  private subAgentViewGeneration = 0
  private subAgentLoad?: SubAgentLoad
  private readonly subAgentEvents = new Map<string, ExtensionToWebview[]>()
  private openSubAgentSessionID?: string
  private openSubAgentTitle?: string
  private readonly pendingOptimisticMessages = new Set<string>()
  private activePromptSessionID?: string
  private activePromptMessageID?: string
  // Monotonic token for loadMessages: any newer load invalidates in-flight
  // older ones so a slow/stale response can't overwrite fresher state.
  private loadGeneration = 0
  private historyGeneration = 0
  private olderMessagesGeneration = 0
  private historyIndex?: RaccoonState["sessions"]

  constructor(private readonly deps: SessionControllerDeps) {}

  async createSession(mode: ChatMode = this.deps.getState().mode) {
    await this.deps.withLoading(async () => {
      const session = await (await this.deps.client()).session.create(
        {
          directory: this.deps.directory(),
          agent: mode,
        },
        { throwOnError: true },
      )
      this.olderMessagesGeneration++
      this.deps.setState({
        ...this.deps.getState(),
        mode,
        activeSessionID: session.data.id,
        messages: [],
        messageHistorySessionID: session.data.id,
        messageCursor: undefined,
        messagesLoadingOlder: false,
        messagesOlderError: false,
        messagesComplete: false,
        messagesLoadedOlder: false,
      })
      this.pendingOptimisticMessages.clear()
      await this.refresh()
    })
  }

  async refresh() {
    await this.deps.ensureEventStream()
    await this.deps.withLoading(async () => {
      const client = await this.deps.client()
      await this.deps.loadModels(client)
      const response = await client.session.list(
        { directory: this.deps.directory(), roots: true, limit: 50 },
        { throwOnError: true },
      )
      const sessions = sortSessions(response.data.map((session) => mapSession(session)))
      const activeSessionID = this.deps.getState().activeSessionID ?? sessions[0]?.id
      this.deps.setState({
        ...this.deps.getState(),
        sessions,
        activeSessionID,
        activeSession: sessions.find((session) => session.id === activeSessionID),
      })
      if (activeSessionID) {
        await this.loadMessages(activeSessionID)
        return
      }
      this.deps.setState({ ...this.deps.getState(), messages: [], loading: false, busy: false })
      this.deps.post()
    })
  }

  async selectSession(sessionID: string) {
    await this.deps.ensureEventStream()
    this.pendingOptimisticMessages.clear()
    this.olderMessagesGeneration++
    this.deps.setState({
      ...this.deps.getState(),
      activeSessionID: sessionID,
      messages: [],
      messageHistorySessionID: sessionID,
      messageCursor: undefined,
      messagesLoadingOlder: false,
      messagesOlderError: false,
      messagesComplete: false,
      messagesLoadedOlder: false,
      loading: true,
      busy: true,
      error: undefined,
    })
    this.deps.post()
    await this.loadMessages(sessionID)
  }

  async renameSession(sessionID: string, title: string) {
    await (await this.deps.client()).session.update({ sessionID, title }, { throwOnError: true })
    await this.refreshSessionList()
    if (this.deps.getState().activeSessionID === sessionID) await this.loadMessages(sessionID)
  }

  async deleteSession(sessionID: string) {
    const wasActive = this.deps.getState().activeSessionID === sessionID
    await (await this.deps.client()).session.delete({ sessionID }, { throwOnError: true })
    this.deps.removeSession(sessionID)
    this.deps.post()
    if (!wasActive) return
    const next = this.deps.getState().sessions[0]?.id
    if (next) {
      await this.selectSession(next)
      return
    }
    this.deps.setState({
      ...this.deps.getState(),
      activeSessionID: undefined,
      activeSession: undefined,
      messages: [],
      messageHistorySessionID: undefined,
      messageCursor: undefined,
      messagesLoadingOlder: false,
      messagesOlderError: false,
      messagesComplete: true,
      messagesLoadedOlder: false,
      loading: false,
      busy: false,
    })
    this.deps.post()
  }

  async exportSession(sessionID: string) {
    const client = await this.deps.client()
    const [info, messages] = await Promise.all([
      client.session.get({ sessionID }, { throwOnError: true }),
      client.session.messages({ sessionID }, { throwOnError: true }),
    ])
    const filename = `${(info.data.title || sessionID).replace(/[\\/:*?"<>|]/g, "-")}.md`
    await this.deps.saveFile({
      title: "Export session",
      saveLabel: "Export",
      defaultName: filename,
      directory: this.deps.directory(),
      filters: { Markdown: ["md"] },
      data: Buffer.from(exportMarkdown({ info: info.data, messages: messages.data })),
    })
  }

  async revertSession(sessionID: string, messageID: string, source: RaccoonWebviewSource) {
    const client = await this.deps.client()
    if (this.deps.getState().busy) {
      await this.stopSession()
    }
    const { data, error } = await client.session.revert(
      {
        sessionID,
        directory: this.deps.directory(),
        messageID,
      },
      { throwOnError: false },
    )
    if (error) {
      this.deps.webviewHost.post(source, { type: "error", message: `Failed to revert session: ${String(error)}` } satisfies ExtensionToWebview)
      return
    }
    if (data) {
      const next = mapSession(data)
      this.deps.setState({
        ...this.deps.getState(),
        sessions: sortSessions(this.deps.getState().sessions.map((item) => (item.id === data.id ? next : item))),
        activeSession: next,
      })
      this.deps.webviewHost.postSession(next)
      this.deps.post()
      await this.loadMessages(sessionID)
    }
  }

  async unrevertSession(sessionID: string, source: RaccoonWebviewSource) {
    const client = await this.deps.client()
    const { data, error } = await client.session.unrevert(
      {
        sessionID,
        directory: this.deps.directory(),
      },
      { throwOnError: false },
    )
    if (error) {
      this.deps.webviewHost.post(source, { type: "error", message: `Failed to restore session: ${String(error)}` } satisfies ExtensionToWebview)
      return
    }
    if (data) {
      const next = mapSession(data)
      this.deps.setState({
        ...this.deps.getState(),
        sessions: sortSessions(this.deps.getState().sessions.map((item) => (item.id === data.id ? next : item))),
        activeSession: next,
      })
      this.deps.webviewHost.postSession(next)
      this.deps.post()
      await this.loadMessages(sessionID)
    }
  }

  async loadMessages(sessionID: string) {
    this.deps.streams.drop()
    const generation = ++this.loadGeneration
    const client = await this.deps.client()
    const [info, response, status] = await Promise.all([
      client.session.get(
        {
          sessionID,
          directory: this.deps.directory(),
        },
        { throwOnError: true },
      ),
      client.session.messages(
        {
          sessionID,
          directory: this.deps.directory(),
          limit: 200,
        },
        { throwOnError: true },
      ),
      client.session.status({ directory: this.deps.directory() }, { throwOnError: true }),
    ])
    // Discard stale responses: a newer loadMessages has superseded this one.
    if (generation !== this.loadGeneration) return
    const messages = response.data
      .flatMap((message) => mapMessage(message))
      .filter((message) => message.text.trim() || message.parts.length > 0)
    const responseCursor = nextMessageCursor(response)
    const state = this.deps.getState()
    const sameHistory = state.activeSessionID === sessionID && state.messageHistorySessionID === sessionID
    const merged = sortMessages([
      ...(sameHistory
        ? state.messages.filter((message) => !messages.some((item) => item.id === message.id))
        : state.activeSessionID === sessionID
          ? state.messages.filter(
              (message) => this.pendingOptimisticMessages.has(message.id) && !messages.some((item) => item.id === message.id),
            )
          : []),
      ...messages,
    ])
    messages.forEach((message) => this.pendingOptimisticMessages.delete(message.id))
    const hasAssistantAfterLatestUser = (() => {
      const prompt = this.activePromptMessageID ? merged.find((message) => message.id === this.activePromptMessageID) : undefined
      const latestUser = prompt ?? [...merged].reverse().find((message) => message.role === "user")
      const latestAssistant = [...merged]
        .reverse()
        .find((message) => message.role === "assistant" && (!latestUser || message.createdAt > latestUser.createdAt))
      return !!latestAssistant && responseText(latestAssistant.parts).length > 0
    })()
    if (hasAssistantAfterLatestUser) this.stopPromptRefresh(sessionID)
    const sessionStatus = status.data[sessionID]?.type ?? "idle"
    if (sessionStatus === "idle" && this.activePromptSessionID === sessionID) this.stopPromptRefresh(sessionID)
    const subSessions = await this.loadSubSessions(merged, status.data)
    // Re-check after loadSubSessions' await: a newer load may have started meanwhile.
    if (generation !== this.loadGeneration) return
    const current = this.deps.getState()
    const currentHistory = current.activeSessionID === sessionID && current.messageHistorySessionID === sessionID
    const finalMessages = sortMessages([
      ...(currentHistory ? current.messages.filter((message) => !merged.some((item) => item.id === message.id)) : []),
      ...merged,
    ])
    this.deps.setState({
      ...current,
      activeSessionID: sessionID,
      sessions: sortSessions(current.sessions.map((session) => (session.id === sessionID ? mapSession(info.data) : session))),
      activeSession: mapSession(info.data),
      messages: finalMessages,
      messageHistorySessionID: sessionID,
      messageCursor: currentHistory && current.messagesLoadedOlder ? current.messageCursor : responseCursor,
      messagesLoadingOlder: currentHistory ? current.messagesLoadingOlder : false,
      messagesOlderError: currentHistory ? current.messagesOlderError : false,
      messagesComplete: currentHistory && current.messagesLoadedOlder ? current.messagesComplete : !responseCursor,
      messagesLoadedOlder: currentHistory ? (current.messagesLoadedOlder ?? false) : false,
      subSessions,
      loading: sessionStatus !== "idle",
      busy: sessionStatus !== "idle",
      error: undefined,
    })
    this.deps.post()
    await this.recoverPendingQuestions(sessionID)
  }

  async loadOlderMessages(sessionID: string) {
    const state = this.deps.getState()
    if (
      state.activeSessionID !== sessionID ||
      state.messageHistorySessionID !== sessionID ||
      state.messagesLoadingOlder ||
      state.messagesComplete ||
      !state.messageCursor
    )
      return
    const cursor = state.messageCursor
    const generation = ++this.olderMessagesGeneration
    this.deps.setState({ ...state, messagesLoadingOlder: true, messagesOlderError: false })
    this.deps.post()
    try {
      const response = await (await this.deps.client()).session.messages(
        {
          sessionID,
          directory: this.deps.directory(),
          limit: 200,
          before: cursor,
        },
        { throwOnError: true },
      )
      if (this.deps.getState().activeSessionID !== sessionID || generation !== this.olderMessagesGeneration) return
      const older = response.data
        .flatMap((message) => mapMessage(message))
        .filter((message) => message.text.trim() || message.parts.length > 0)
      const current = this.deps.getState()
      const messages = sortMessages([
        ...older.filter((message) => !current.messages.some((item) => item.id === message.id)),
        ...current.messages,
      ])
      const nextCursor = nextMessageCursor(response)
      this.deps.setState({
        ...current,
        messages,
        messageCursor: nextCursor,
        messagesLoadingOlder: false,
        messagesOlderError: false,
        messagesComplete: !nextCursor,
        messagesLoadedOlder: true,
      })
      this.deps.post()
    } catch (error) {
      if (this.deps.getState().activeSessionID !== sessionID || generation !== this.olderMessagesGeneration) return
      this.deps.setState({ ...this.deps.getState(), messagesLoadingOlder: false, messagesOlderError: true })
      this.deps.report(error)
      this.deps.post()
    }
  }

  async requestContextInspector(
    message: Extract<WebviewToExtension, { type: "requestContextInspector" }>,
    source: RaccoonWebviewSource,
  ) {
    try {
      const client = await this.deps.client()
      const [session, messages] = await Promise.all([
        client.session.get(
          { sessionID: message.sessionID, directory: this.deps.directory() },
          { throwOnError: true },
        ),
        client.session.messages(
          { sessionID: message.sessionID, directory: this.deps.directory(), limit: 200 },
          { throwOnError: true },
        ),
      ])
      this.deps.webviewHost.post(source, {
        type: "contextInspectorResult",
        requestID: message.requestID,
        sessionID: message.sessionID,
        snapshot: contextInspectorSnapshot(session.data, messages.data, !!nextMessageCursor(messages)),
      } satisfies ExtensionToWebview)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      this.deps.log(`context inspector failed (${message.sessionID}): ${detail}`)
      this.deps.webviewHost.post(source, {
        type: "contextInspectorResult",
        requestID: message.requestID,
        sessionID: message.sessionID,
        error: detail,
      } satisfies ExtensionToWebview)
    }
  }

  async loadHistory(query = "", force = false) {
    const normalized = query.trim()
    const state = this.deps.getState()
    if (!force && state.historyQuery === normalized && state.historySessions) return
    const generation = ++this.historyGeneration
    this.deps.setState({
      ...state,
      historyQuery: normalized,
      historySessions: state.historyQuery === normalized ? state.historySessions : [],
      historyLoading: true,
      historyCursor: undefined,
      historyComplete: false,
    })
    this.deps.post()
    try {
      if (force || !this.historyIndex) this.historyIndex = await this.loadHistoryIndex(generation)
      if (generation !== this.historyGeneration) return
      this.publishHistory(normalized, 50)
    } catch (error) {
      if (generation !== this.historyGeneration) return
      this.deps.setState({ ...this.deps.getState(), historyLoading: false })
      this.deps.report(error)
      this.deps.post()
    }
  }

  async loadMoreHistory() {
    const state = this.deps.getState()
    if (state.historyLoading || state.historyComplete || !state.historyCursor) return
    this.publishHistory(state.historyQuery ?? "", Number(state.historyCursor) + 50)
  }

  upsertHistorySession(session: Session) {
    if (!this.historyIndex) return
    if (session.parentID || session.time.archived) {
      this.removeHistorySession(session.id)
      return
    }
    this.historyIndex = sortSessions([
      mapSession(session),
      ...this.historyIndex.filter((item) => item.id !== session.id),
    ])
  }

  removeHistorySession(sessionID: string) {
    if (!this.historyIndex) return
    this.historyIndex = this.historyIndex.filter((session) => session.id !== sessionID)
  }

  private async loadHistoryIndex(generation: number) {
    const sessions: RaccoonState["sessions"] = []
    const client = await this.deps.client()
    const limit = 5_000
    let cursor: string | undefined
    for (;;) {
      const response = await client.v2.session.list(
        {
          directory: this.deps.directory(),
          limit,
          ...(cursor ? { cursor } : { order: "desc" as const }),
        },
        { throwOnError: true },
      )
      if (generation !== this.historyGeneration) return []
      sessions.push(
        ...response.data.data
          .filter((session) => !session.parentID && !session.time.archived)
          .map(mapSessionV2),
      )
      if (response.data.data.length < limit || !response.data.cursor.next) return sortSessions(sessions)
      cursor = response.data.cursor.next
    }
  }

  private publishHistory(query: string, limit: number) {
    const needle = query.toLowerCase()
    const matches = (this.historyIndex ?? []).filter((session) => !needle || session.title.toLowerCase().includes(needle))
    const count = Math.min(limit, matches.length)
    this.deps.setState({
      ...this.deps.getState(),
      historySessions: matches.slice(0, count),
      historyCursor: count < matches.length ? String(count) : undefined,
      historyLoading: false,
      historyComplete: count >= matches.length,
    })
    this.deps.post()
  }

  async recoverPendingQuestions(sessionID = this.deps.getState().activeSessionID) {
    if (!sessionID) return
    try {
      const response = await (await this.deps.client()).question.list({ directory: this.deps.directory() })
      for (const question of response.data ?? []) {
        if (question.sessionID !== sessionID) continue
        this.deps.webviewHost.post("chat", {
          type: "questionRequest",
          question: {
            id: question.id,
            sessionID: question.sessionID,
            questions: question.questions,
            tool: question.tool,
          },
        } satisfies ExtensionToWebview)
      }
    } catch (error) {
      this.deps.log(`pending question recovery failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async sendMessage(
    targetSessionID: string | undefined,
    text: string,
    mode: ChatMode,
    model?: { providerID: string; modelID: string; variant?: string },
    files?: { path: string; filename?: string; mime?: string; url: string; source?: FilePartInput["source"] }[],
  ) {
    let sessionID = targetSessionID
    if (!sessionID) {
      await this.createSession(mode)
      sessionID = this.deps.getState().activeSessionID
      if (!sessionID) return
    }
    const client = await this.deps.client()
    const status = await client.session.status({ directory: this.deps.directory() }, { throwOnError: true })
    const sessionStatus = status.data[sessionID]?.type ?? "idle"
    if (sessionStatus !== "idle") {
      if (this.deps.getState().activeSessionID !== sessionID) return
      this.deps.setState({ ...this.deps.getState(), loading: true, busy: true })
      this.deps.post()
      this.schedulePromptRefresh(sessionID)
      return
    }

    const messageID = ascendingID("msg")
    const firstLine = text.split("\n")[0] ?? ""
    const commandName = firstLine.startsWith("/") ? firstLine.split(" ")[0]?.slice(1) : undefined
    const command = commandName ? this.deps.getState().commands?.find((item) => item.name === commandName) : undefined
    const commandArguments = command ? text.slice(command.name.length + 2).trimStart() : ""
    const inputFiles = files ?? []
    const contextFiles = await contextMentionAttachments(
      text,
      this.deps.directory(),
      this.deps.captureTerminal,
      inputFiles.map((item) => item.filename ?? item.path),
    )
    const fileParts: (FilePartInput & RaccoonMessagePart)[] = [...inputFiles, ...contextFiles].map((file) => ({
      id: ascendingID("prt"),
      type: "file",
      mime: file.mime ?? "text/plain",
      filename: file.filename ?? file.path.split(/[\\/]/).filter(Boolean).pop(),
      url: file.url,
      source: file.source,
    }))
    const textPart = { id: ascendingID("prt"), type: "text" as const, text }
    const tracksActiveSession = this.deps.getState().activeSessionID === sessionID
    if (tracksActiveSession) {
      this.activePromptSessionID = sessionID
      this.activePromptMessageID = messageID
      this.pendingOptimisticMessages.add(messageID)
      this.deps.setState({
        ...this.deps.getState(),
        loading: true,
        busy: true,
        error: undefined,
        messages: sortMessages([
          ...this.deps.getState().messages.filter((message) => message.id !== messageID),
          {
            id: messageID,
            role: "user",
            text,
            parts: [...fileParts, textPart],
            createdAt: Date.now(),
          },
        ]),
      })
      this.deps.post()
      this.schedulePromptRefresh(sessionID)
    }
    void (command
      ? client.session.command(
          {
            sessionID,
            directory: this.deps.directory(),
            agent: mode,
            model: `${(model ?? this.deps.config.modeModel(mode) ?? this.deps.getState().selectedModel)?.providerID ?? ""}/${(model ?? this.deps.config.modeModel(mode) ?? this.deps.getState().selectedModel)?.modelID ?? ""}`,
            messageID,
            command: command.name,
            arguments: commandArguments,
            parts: fileParts.map((file) => ({
              type: "file" as const,
              mime: file.mime,
              url: file.url,
              filename: file.filename,
              source: file.source,
            })),
          },
          { throwOnError: true },
        )
      : client.session.promptAsync(
          {
            sessionID,
            directory: this.deps.directory(),
            agent: mode,
            model: model ?? this.deps.config.modeModel(mode) ?? this.deps.getState().selectedModel,
            messageID,
            parts: [...fileParts, textPart],
          },
          { throwOnError: true },
        ))
      .then(() => {
        if (tracksActiveSession && this.deps.getState().activeSessionID === sessionID) this.schedulePromptRefresh(sessionID)
      })
      .catch((error) => {
        if (this.activePromptSessionID === sessionID) this.activePromptSessionID = undefined
        if (this.activePromptMessageID === messageID) this.activePromptMessageID = undefined
        this.deps.report(error)
      })
  }

  async questionReply(message: Extract<WebviewToExtension, { type: "questionReply" }>) {
    try {
      const client = await this.deps.client()
      await client.question.reply(
        {
          requestID: message.requestID,
          answers: message.answers,
          directory: this.deps.directory(),
        },
        { throwOnError: true },
      )
      this.deps.webviewHost.post("chat", { type: "questionResolved", requestID: message.requestID } satisfies ExtensionToWebview)
      const sessionID = this.deps.getState().activeSessionID ?? message.sessionID
      if (sessionID) await this.loadMessages(sessionID)
    } catch (error) {
      this.deps.webviewHost.post("chat", { type: "questionError", requestID: message.requestID } satisfies ExtensionToWebview)
      this.deps.report(error)
    }
  }

  async questionReject(message: Extract<WebviewToExtension, { type: "questionReject" }>) {
    try {
      const client = await this.deps.client()
      await client.question.reject(
        {
          requestID: message.requestID,
          directory: this.deps.directory(),
        },
        { throwOnError: true },
      )
      this.deps.webviewHost.post("chat", { type: "questionResolved", requestID: message.requestID } satisfies ExtensionToWebview)
      const sessionID = message.sessionID ?? this.deps.getState().activeSessionID
      if (sessionID) await this.loadMessages(sessionID)
    } catch (error) {
      this.deps.webviewHost.post("chat", { type: "questionError", requestID: message.requestID } satisfies ExtensionToWebview)
      this.deps.report(error)
    }
  }

  async permissionReply(message: Extract<WebviewToExtension, { type: "permissionReply" }>) {
    try {
      const client = await this.deps.client()
      await client.permission.reply(
        {
          requestID: message.requestID,
          reply: message.reply,
          directory: this.deps.directory(),
        },
        { throwOnError: true },
      )
      this.deps.webviewHost.post("chat", { type: "permissionResolved", requestID: message.requestID } satisfies ExtensionToWebview)
      const sessionID = this.deps.getState().activeSessionID ?? message.sessionID
      if (sessionID) await this.loadMessages(sessionID)
    } catch (error) {
      this.deps.webviewHost.post("chat", { type: "permissionError", requestID: message.requestID } satisfies ExtensionToWebview)
      this.deps.report(error)
    }
  }

  async runSlashCommand(name: string, source: RaccoonWebviewSource) {
    const command = uiSlashCommands().find((item) => item.name === name || item.aliases?.includes(name))
    if (!command) return
    if (command.name === "sessions") {
      await this.openHistory()
      return
    }
    if (command.name === "new") {
      await this.createSession()
      return
    }
    if (command.name === "settings") {
      await this.openSettings()
      return
    }
    if (command.name === "compact") {
      const sessionID = this.deps.getState().activeSessionID
      const model = this.deps.getState().selectedModel ?? this.deps.config.modeModel(this.deps.getState().mode)
      if (!sessionID || !model) return
      await (await this.deps.client()).session.summarize(
        {
          sessionID,
          directory: this.deps.directory(),
          providerID: model.providerID,
          modelID: model.modelID,
        },
        { throwOnError: true },
      )
      await this.loadMessages(sessionID)
      return
    }
    if (command.name === "undo") {
      const sessionID = this.deps.getState().activeSessionID
      const message = [...this.deps.getState().messages].reverse().find((item) => item.role === "user")
      if (!sessionID || !message) return
      await this.revertSession(sessionID, message.id, source)
      return
    }
    this.deps.webviewHost.post(source, { type: "error", message: `Slash command /${name} is not supported yet` } satisfies ExtensionToWebview)
  }

  async stopSession() {
    const sessionID = this.deps.getState().activeSessionID
    if (!sessionID) return
    await (await this.deps.client()).session.abort(
      {
        sessionID,
        directory: this.deps.directory(),
      },
      { throwOnError: true },
    )
    this.clearPromptRefresh(sessionID)
    this.deps.setState({ ...this.deps.getState(), loading: false, busy: false })
    this.deps.post()
    await this.loadMessages(sessionID)
  }

  async refreshMessagesFromEvent() {
    if (this.refreshingFromEvent || !this.deps.getState().activeSessionID) return
    const activeSessionID = this.deps.getState().activeSessionID
    if (!activeSessionID) return
    this.refreshingFromEvent = true
    try {
      const client = await this.deps.client()
      await this.deps.loadModels(client)
      await this.loadMessages(activeSessionID)
    } catch (error) {
      this.deps.log(`event refresh failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      this.refreshingFromEvent = false
    }
  }

  async openHistory() {
    const loading = this.loadHistory("", true)
    this.deps.webviewHost.post("chat", { type: "showHistory" } satisfies ExtensionToWebview)
    await loading
  }

  async openSubAgent(sessionID: string, title: string | undefined) {
    // Show the sub-agent view immediately in a loading state, then fetch the
    // child session's full conversation and render it read-only. Reuses the same
    // mapMessage pipeline as the main message stream so rendering stays identical.
    // Drive the view via a dedicated message (not state.view) because postState()
    // hard-codes view: "chat" for the chat webview.
    //
    // The child session keeps emitting events while the parent task runs; we track
    // the open sub-agent here so the event handler can drive incremental refreshes
    // (see scheduleSubAgentRefresh), giving the view a streaming-like update.
    const generation = ++this.subAgentViewGeneration
    this.openSubAgentSessionID = sessionID
    this.openSubAgentTitle = title
    this.clearSubAgentRefresh()
    const load = this.beginSubAgentLoad(sessionID, generation)
    this.deps.webviewHost.post("chat", {
      type: "showSubAgent",
      view: { sessionID, title, messages: [], loading: true },
    } satisfies ExtensionToWebview)
    try {
      const view = await this.fetchSubAgentView(sessionID)
      this.completeSubAgentLoad(load, { sessionID, title, ...view, loading: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.deps.log(`open sub-agent failed (${sessionID}): ${message}`)
      this.completeSubAgentLoad(load, { sessionID, title, messages: [], loading: false, error: message })
    }
  }

  // Debounced incremental refresh of the open sub-agent view. Called by the event
  // handler for every event whose sessionID matches the open child session, so the
  // view updates as the sub-agent works instead of staying a one-shot snapshot.
  scheduleSubAgentRefresh(sessionID: string) {
    if (this.openSubAgentSessionID !== sessionID) return
    if (this.subAgentRefreshTimer) return
    this.subAgentRefreshTimer = setTimeout(() => {
      this.subAgentRefreshTimer = undefined
      void this.refreshSubAgent(sessionID)
    }, 120)
  }

  isOpenSubAgent(sessionID: string) {
    return this.openSubAgentSessionID === sessionID
  }

  isTrackedSubAgent(sessionID: string) {
    if (this.isOpenSubAgent(sessionID)) return true
    const state = this.deps.getState()
    const activeSessionID = state.activeSessionID
    if (!activeSessionID) return false
    if (state.subSessions?.[sessionID]) return true
    if (
      state.messages.some((message) =>
        message.parts.some((part) => part.tool === "task" && part.metadata?.sessionId === sessionID),
      )
    )
      return true
    if (
      Object.values(state.subSessions ?? {}).some((subSession) =>
        subSession.tools.some((tool) => tool.sessionID === sessionID),
      )
    )
      return true

    const sessions = new Map(state.sessions.map((session) => [session.id, session]))
    const seen = new Set<string>()
    let current = sessions.get(sessionID)
    while (current?.parentID && !seen.has(current.id)) {
      if (current.parentID === activeSessionID) return true
      seen.add(current.id)
      current = sessions.get(current.parentID)
    }
    return false
  }

  postSubAgentEvent(sessionID: string, message: ExtensionToWebview) {
    const events = this.subAgentEvents.get(sessionID) ?? []
    events.push(message)
    this.subAgentEvents.set(sessionID, events)
    if (!this.isOpenSubAgent(sessionID)) return
    if (this.subAgentLoad?.sessionID === sessionID && this.subAgentLoad.generation === this.subAgentViewGeneration) {
      this.subAgentLoad.events.push(message)
      return
    }
    this.deps.webviewHost.post("chat", message)
  }

  completeTrackedSubAgent(sessionID: string) {
    if (!this.isOpenSubAgent(sessionID)) this.subAgentEvents.delete(sessionID)
  }

  private isCurrentSubAgent(sessionID: string, generation: number) {
    return this.openSubAgentSessionID === sessionID && this.subAgentViewGeneration === generation
  }

  // When refreshSubAgent is called while one is already running, set a pending
  // flag so the in-flight refresh can re-schedule one more fetch in its finally.
  private async refreshSubAgent(sessionID: string) {
    if (this.refreshingSubAgent || this.subAgentLoad || this.openSubAgentSessionID !== sessionID) {
      if ((this.refreshingSubAgent || this.subAgentLoad) && this.openSubAgentSessionID === sessionID)
        this.subAgentRefreshPending = true
      return
    }
    const generation = this.subAgentViewGeneration
    this.refreshingSubAgent = true
    const load = this.beginSubAgentLoad(sessionID, generation)
    try {
      const view = await this.fetchSubAgentView(sessionID)
      this.completeSubAgentLoad(load, { sessionID, title: this.openSubAgentTitle, ...view, loading: false })
    } catch (error) {
      // Transient refresh failures must not clobber the rendered view; the next
      // event (or the final idle event) will retry the fetch.
      this.deps.log(`refresh sub-agent failed (${sessionID}): ${error instanceof Error ? error.message : String(error)}`)
      this.failSubAgentLoad(load)
    } finally {
      this.refreshingSubAgent = false
      const pendingSessionID = this.subAgentRefreshPending ? this.openSubAgentSessionID : undefined
      this.subAgentRefreshPending = false
      if (pendingSessionID) this.scheduleSubAgentRefresh(pendingSessionID)
    }
  }

  private async fetchSubAgentView(sessionID: string) {
    const client = await this.deps.client()
    const [response, status] = await Promise.all([
      client.session.messages(
        { sessionID, directory: this.deps.directory(), limit: 200 },
        { throwOnError: true },
      ),
      client.session.status({ directory: this.deps.directory() }, { throwOnError: true }),
    ])
    return {
      messages: sortMessages(
        response.data
          .flatMap((message) => mapMessage(message))
          .filter((message) => message.text.trim() || message.parts.length > 0),
      ),
      busy: (status.data[sessionID]?.type ?? "idle") !== "idle",
    }
  }

  private beginSubAgentLoad(sessionID: string, generation: number) {
    const load = { sessionID, generation, events: [...(this.subAgentEvents.get(sessionID) ?? [])] } satisfies SubAgentLoad
    this.subAgentLoad = load
    return load
  }

  private completeSubAgentLoad(load: SubAgentLoad, view: RaccoonSubAgentView) {
    if (!this.isCurrentSubAgent(load.sessionID, load.generation) || this.subAgentLoad !== load) return
    this.subAgentLoad = undefined
    this.deps.webviewHost.post("chat", { type: "showSubAgent", view } satisfies ExtensionToWebview)
    load.events.forEach((message) => this.deps.webviewHost.post("chat", message))
    const latestBusy = load.events.filter((message) => message.type === "subAgentBusyChanged").at(-1)
    if ((latestBusy?.busy ?? view.busy) === false) this.subAgentEvents.delete(load.sessionID)
    this.reschedulePendingSubAgentRefresh(load.sessionID)
  }

  private failSubAgentLoad(load: SubAgentLoad) {
    if (!this.isCurrentSubAgent(load.sessionID, load.generation) || this.subAgentLoad !== load) return
    this.subAgentLoad = undefined
    load.events.forEach((message) => this.deps.webviewHost.post("chat", message))
    this.reschedulePendingSubAgentRefresh(load.sessionID)
  }

  private reschedulePendingSubAgentRefresh(sessionID: string) {
    if (!this.subAgentRefreshPending) return
    this.subAgentRefreshPending = false
    this.scheduleSubAgentRefresh(sessionID)
  }

  private clearSubAgentRefresh() {
    if (this.subAgentRefreshTimer) clearTimeout(this.subAgentRefreshTimer)
    this.subAgentRefreshTimer = undefined
    this.subAgentRefreshPending = false
  }

  closeSubAgent() {
    this.subAgentViewGeneration++
    this.subAgentLoad = undefined
    this.openSubAgentSessionID = undefined
    this.openSubAgentTitle = undefined
    this.clearSubAgentRefresh()
    this.deps.webviewHost.post("chat", { type: "closeSubAgent" } satisfies ExtensionToWebview)
  }

  openSettings() {
    this.deps.webviewHost.openSettings()
  }

  clearEventRefreshTimer() {
    if (this.eventRefreshTimer) clearTimeout(this.eventRefreshTimer)
    this.eventRefreshTimer = undefined
  }

  scheduleEventRefresh() {
    if (!this.deps.getState().activeSessionID) return
    if (this.eventRefreshTimer) return
    this.eventRefreshTimer = setTimeout(() => {
      this.eventRefreshTimer = undefined
      void this.refreshMessagesFromEvent()
    }, 80)
  }

  schedulePromptRefresh(sessionID: string) {
    if (this.promptRefreshTimer) return
    this.promptRefreshTimer = setTimeout(() => {
      this.promptRefreshTimer = undefined
      if (this.deps.getState().activeSessionID !== sessionID || !this.deps.getState().loading) return
      void this.loadMessages(sessionID)
        .catch((error) => this.deps.log(`prompt refresh failed: ${error instanceof Error ? error.message : String(error)}`))
        .finally(() => {
          if (this.deps.getState().activeSessionID === sessionID && this.deps.getState().loading) this.schedulePromptRefresh(sessionID)
        })
    }, 700)
  }

  stopPromptRefresh(sessionID: string) {
    if (this.activePromptSessionID !== sessionID) return
    this.clearPromptRefresh(sessionID)
  }

  clearPromptRefresh(sessionID: string) {
    if (this.promptRefreshTimer) clearTimeout(this.promptRefreshTimer)
    this.promptRefreshTimer = undefined
    if (this.activePromptSessionID === sessionID) this.activePromptSessionID = undefined
    this.activePromptMessageID = undefined
  }

  dispose() {
    this.clearEventRefreshTimer()
    this.clearSubAgentRefresh()
    if (this.promptRefreshTimer) clearTimeout(this.promptRefreshTimer)
  }

  private async loadSubSessions(
    messages: { parts: RaccoonMessagePart[] }[],
    status: Record<string, { type: string } | undefined>,
  ): Promise<Record<string, RaccoonSubSession> | undefined> {
    const ids = new Set<string>()
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type !== "tool" || part.tool !== "task") continue
        const sessionId = part.metadata?.sessionId
        if (typeof sessionId === "string" && sessionId) ids.add(sessionId)
      }
    }
    if (ids.size === 0) return undefined
    const client = await this.deps.client()
    const entries = await Promise.all(
      [...ids].map(async (childID) => {
        try {
          const response = await client.session.messages(
            { sessionID: childID, directory: this.deps.directory(), limit: 200 },
            { throwOnError: true },
          )
          return [childID, mapSubSession(childID, response.data, status[childID]?.type ?? "idle")] as const
        } catch (error) {
          this.deps.log(`sub-session load failed (${childID}): ${error instanceof Error ? error.message : String(error)}`)
          return undefined
        }
      }),
    )
    const record: Record<string, RaccoonSubSession> = {}
    for (const entry of entries) if (entry) record[entry[0]] = entry[1]
    return Object.keys(record).length > 0 ? record : undefined
  }

  private async refreshSessionList() {
    const response = await (await this.deps.client()).session.list(
      { directory: this.deps.directory(), roots: true, limit: 50 },
      { throwOnError: true },
    )
    const sessions = sortSessions(response.data.map((session) => mapSession(session)))
    this.deps.setState({
      ...this.deps.getState(),
      sessions,
      activeSession: sessions.find((session) => session.id === this.deps.getState().activeSessionID),
    })
    this.deps.post()
  }
}

function nextMessageCursor(response: { response?: Response }) {
  return response.response?.headers.get("x-next-cursor") ?? undefined
}
