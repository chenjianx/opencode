import type { FilePartInput, OpencodeClient } from "@opencode-ai/sdk/v2/client"
import type {
  ChatMode,
  ExtensionToWebview,
  RaccoonMessagePart,
  RaccoonState,
  RaccoonSubSession,
  WebviewToExtension,
} from "@opencode-ai/raccoon-webview"
import { uiSlashCommands } from "../config/commands.js"
import { contextMentionAttachments } from "../editor/context-mentions.js"
import { exportMarkdown } from "../message/export-markdown.js"
import { ascendingID } from "../message/ids.js"
import { mapMessage, mapSession, mapSubSession, responseText, sortMessages, sortSessions } from "../message/mapping.js"
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

export class RaccoonSessionController {
  private eventRefreshTimer?: ReturnType<typeof setTimeout>
  private promptRefreshTimer?: ReturnType<typeof setTimeout>
  private subAgentRefreshTimer?: ReturnType<typeof setTimeout>
  private refreshingFromEvent = false
  private refreshingSubAgent = false
  private subAgentRefreshPending = false
  private openSubAgentSessionID?: string
  private openSubAgentTitle?: string
  private readonly pendingOptimisticMessages = new Set<string>()
  private activePromptSessionID?: string
  private activePromptMessageID?: string
  // Monotonic token for loadMessages: any newer load invalidates in-flight
  // older ones so a slow/stale response can't overwrite fresher state.
  private loadGeneration = 0

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
      this.deps.setState({ ...this.deps.getState(), mode, activeSessionID: session.data.id, messages: [] })
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
        { directory: this.deps.directory(), limit: 50 },
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
    this.deps.setState({ ...this.deps.getState(), activeSessionID: sessionID, loading: true, busy: true, error: undefined })
    this.deps.post()
    await this.loadMessages(sessionID)
  }

  async renameSession(sessionID: string, title: string) {
    await (await this.deps.client()).session.update({ sessionID, title }, { throwOnError: true })
    await this.refreshSessionList()
    if (this.deps.getState().activeSessionID === sessionID) await this.loadMessages(sessionID)
  }

  async deleteSession(sessionID: string) {
    await (await this.deps.client()).session.delete({ sessionID }, { throwOnError: true })
    this.deps.removeSession(sessionID)
    this.deps.post()
    if (this.deps.getState().activeSessionID !== sessionID) return
    const next = this.deps.getState().sessions[0]?.id
    if (next) {
      await this.loadMessages(next)
      return
    }
    this.deps.setState({
      ...this.deps.getState(),
      activeSessionID: undefined,
      activeSession: undefined,
      messages: [],
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
    const merged = sortMessages([
      ...(this.deps.getState().activeSessionID === sessionID
        ? this.deps
            .getState()
            .messages.filter((message) => this.pendingOptimisticMessages.has(message.id) && !messages.some((item) => item.id === message.id))
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
    this.deps.setState({
      ...this.deps.getState(),
      activeSessionID: sessionID,
      sessions: sortSessions(this.deps.getState().sessions.map((session) => (session.id === sessionID ? mapSession(info.data) : session))),
      activeSession: mapSession(info.data),
      messages: merged,
      subSessions,
      loading: sessionStatus !== "idle",
      busy: sessionStatus !== "idle",
      error: undefined,
    })
    this.deps.post()
    await this.recoverPendingQuestions(sessionID)
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
    text: string,
    mode: ChatMode,
    model?: { providerID: string; modelID: string },
    files?: { path: string; filename?: string; mime?: string; url: string; source?: FilePartInput["source"] }[],
  ) {
    let sessionID = this.deps.getState().activeSessionID
    if (!sessionID) {
      await this.createSession(mode)
      sessionID = this.deps.getState().activeSessionID
      if (!sessionID) return
    }
    const client = await this.deps.client()
    const status = await client.session.status({ directory: this.deps.directory() }, { throwOnError: true })
    const sessionStatus = status.data[sessionID]?.type ?? "idle"
    if (sessionStatus !== "idle") {
      this.deps.setState({ ...this.deps.getState(), loading: true, busy: true })
      this.deps.post()
      this.schedulePromptRefresh(sessionID)
      return
    }

    const messageID = ascendingID("msg")
    this.activePromptSessionID = sessionID
    this.activePromptMessageID = messageID
    this.pendingOptimisticMessages.add(messageID)
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
        this.schedulePromptRefresh(sessionID)
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
      const sessionID = message.sessionID ?? this.deps.getState().activeSessionID
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
      const sessionID = message.sessionID ?? this.deps.getState().activeSessionID
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

  openHistory() {
    this.deps.webviewHost.post("chat", { type: "showHistory" } satisfies ExtensionToWebview)
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
    this.openSubAgentSessionID = sessionID
    this.openSubAgentTitle = title
    this.clearSubAgentRefresh()
    this.deps.webviewHost.post("chat", {
      type: "showSubAgent",
      view: { sessionID, title, messages: [], loading: true },
    } satisfies ExtensionToWebview)
    try {
      const messages = await this.fetchSubAgentMessages(sessionID)
      if (this.openSubAgentSessionID !== sessionID) return
      this.deps.webviewHost.post("chat", {
        type: "showSubAgent",
        view: { sessionID, title, messages, loading: false },
      } satisfies ExtensionToWebview)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.deps.log(`open sub-agent failed (${sessionID}): ${message}`)
      if (this.openSubAgentSessionID !== sessionID) return
      this.deps.webviewHost.post("chat", {
        type: "showSubAgent",
        view: { sessionID, title, messages: [], loading: false, error: message },
      } satisfies ExtensionToWebview)
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

  // When refreshSubAgent is called while one is already running, set a pending
  // flag so the in-flight refresh can re-schedule one more fetch in its finally.
  private async refreshSubAgent(sessionID: string) {
    if (this.refreshingSubAgent || this.openSubAgentSessionID !== sessionID) {
      if (this.refreshingSubAgent && this.openSubAgentSessionID === sessionID) this.subAgentRefreshPending = true
      return
    }
    this.refreshingSubAgent = true
    try {
      const messages = await this.fetchSubAgentMessages(sessionID)
      if (this.openSubAgentSessionID !== sessionID) return
      this.deps.webviewHost.post("chat", {
        type: "showSubAgent",
        view: { sessionID, title: this.openSubAgentTitle, messages, loading: false },
      } satisfies ExtensionToWebview)
    } catch (error) {
      // Transient refresh failures must not clobber the rendered view; the next
      // event (or the final idle event) will retry the fetch.
      this.deps.log(`refresh sub-agent failed (${sessionID}): ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      this.refreshingSubAgent = false
      if (this.subAgentRefreshPending && this.openSubAgentSessionID === sessionID) {
        this.subAgentRefreshPending = false
        this.scheduleSubAgentRefresh(sessionID)
      }
    }
  }

  private async fetchSubAgentMessages(sessionID: string) {
    const client = await this.deps.client()
    const response = await client.session.messages(
      { sessionID, directory: this.deps.directory(), limit: 200 },
      { throwOnError: true },
    )
    return sortMessages(
      response.data
        .flatMap((message) => mapMessage(message))
        .filter((message) => message.text.trim() || message.parts.length > 0),
    )
  }

  private clearSubAgentRefresh() {
    if (this.subAgentRefreshTimer) clearTimeout(this.subAgentRefreshTimer)
    this.subAgentRefreshTimer = undefined
    this.subAgentRefreshPending = false
  }

  closeSubAgent() {
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
      { directory: this.deps.directory(), limit: 50 },
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
