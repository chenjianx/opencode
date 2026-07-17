import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type {
  ChatMode,
  RaccoonCommand,
  RaccoonAgentScope,
  RaccoonAgentConfigInput,
  RaccoonFileAttachment,
  RaccoonManagedCommand,
  RaccoonManagedCommandInput,
  RaccoonMessage,
  RaccoonModel,
  RaccoonPluginLanguage,
  RaccoonPluginLanguageMode,
  RaccoonPermissionReply,
  RaccoonPermissionRequest,
  RaccoonQuestionRequest,
  RaccoonSession,
  RaccoonSlashCommand,
  RaccoonState,
} from "../protocol"
import { useVSCode } from "./vscode"
import { applyPartUpdates } from "./session-parts"

const initialState: RaccoonState = {
  sessions: [],
  messages: [],
  agents: [],
  models: [],
  providers: [],
  commands: [],
  commandConfigs: [],
  slashCommands: [],
  customProviders: [],
  mcpMarketplace: {
    items: [],
    installed: { project: {}, user: {} },
  },
  skillMarketplace: {
    sources: [],
    items: [],
    installed: { project: {}, user: {} },
  },
  mode: "build",
  loading: true,
}

type SessionStateContextValue = {
  state: RaccoonState
  sessions: RaccoonSession[]
  messages: RaccoonMessage[]
  models: RaccoonModel[]
  commands: RaccoonCommand[]
  commandConfigs: RaccoonManagedCommand[]
  slashCommands: RaccoonSlashCommand[]
  selectedModel?: RaccoonModel
  conversationModel?: RaccoonModel
  conversationVariant?: string
  activeSession?: RaccoonSession
  latestUserMessage?: RaccoonMessage
  latestAssistantMessage?: RaccoonMessage
  visibleMessages: RaccoonMessage[]
  revertedMessages: RaccoonMessage[]
  questions: RaccoonQuestionRequest[]
  questionErrors: Set<string>
  permissions: RaccoonPermissionRequest[]
  permissionErrors: Set<string>
  autoApprovePermissions: boolean
  settingsInline: boolean
}

type SessionActionsContextValue = {
  canSend: (text: string, files?: RaccoonFileAttachment[]) => boolean
  showChat: () => void
  closeSubAgent: () => void
  createSession: () => void
  openHistory: () => void
  openSettings: () => void
  refresh: () => void
  selectSession: (sessionID: string) => void
  renameSession: (sessionID: string, title: string) => void
  deleteSession: (sessionID: string) => void
  exportSession: (sessionID: string) => void
  revertSession: (messageID: string) => void
  restoreRevertedMessage: (messageID: string) => void
  runSlashCommand: (name: string) => void
  setMode: (mode: ChatMode) => void
  setPluginLanguage: (language: RaccoonPluginLanguageMode) => void
  setAutocompleteEnabled: (enabled: boolean) => void
  setModel: (model: { providerID: string; modelID: string }) => void
  setConversationModel: (sessionID: string, model: { providerID: string; modelID: string }) => void
  setConversationVariant: (sessionID: string, variant?: string) => void
  setModeModel: (mode: ChatMode, model?: { providerID: string; modelID: string }) => void
  setModelEnabled: (model: { providerID: string; modelID: string }, enabled: boolean) => void
  setProviderEnabled: (providerID: string, enabled: boolean) => void
  loginRaccoon: (serverUrl?: string) => void
  cancelRaccoonLogin: () => void
  logoutRaccoon: () => void
  configureProvider: (providerID: string, apiKey: string) => void
  configureAgent: (
    name: string,
    agent: RaccoonAgentConfigInput,
    scope: RaccoonAgentScope,
  ) => void
  deleteAgent: (name: string, scope: RaccoonAgentScope) => void
  saveRule: (scope: RaccoonAgentScope, originalName: string, name: string, content: string) => void
  toggleRule: (scope: RaccoonAgentScope, name: string, enabled: boolean) => void
  deleteRule: (scope: RaccoonAgentScope, name: string) => void
  saveCommand: (scope: RaccoonAgentScope, originalName: string, command: RaccoonManagedCommandInput) => void
  deleteCommand: (scope: RaccoonAgentScope, name: string) => void
  connectProvider: (input: {
    providerID: string
    methodIndex?: number
    apiKey?: string
    inputs?: Record<string, string>
  }) => void
  cancelProviderConnect: (providerID?: string) => void
  disconnectProvider: (providerID: string) => void
  configureCustomProvider: (input: {
    providerID: string
    name: string
    package: import("../protocol").CustomProviderPackage
    baseURL: string
    apiKey: string
    headers?: Record<string, string>
    models: Array<{ id: string; name: string }>
    editing?: boolean
  }) => void
  sendMessage: (text: string, files?: RaccoonFileAttachment[], model?: { providerID: string; modelID: string; variant?: string }) => void
  replyToQuestion: (requestID: string, answers: string[][]) => void
  rejectQuestion: (requestID: string) => void
  replyToPermission: (requestID: string, reply: RaccoonPermissionReply) => void
  toggleAutoApprovePermissions: () => void
  openFile: (filePath: string, line?: number, column?: number) => void
  openImage: (input: { url: string; filename?: string; mime?: string }) => void
  stopSession: () => void
}

type SessionContextValue = SessionStateContextValue & SessionActionsContextValue

// Low-frequency configuration slice consumed by the settings UI. Kept separate
// from SessionStateContext so that high-frequency chat updates (partUpdated,
// which only touch messages/loading/busy) do not re-render the settings tree.
type SessionConfigContextValue = {
  agents: RaccoonState["agents"]
  models: RaccoonState["models"]
  providers: RaccoonState["providers"]
  customProviders: RaccoonState["customProviders"]
  commands: RaccoonState["commands"]
  commandConfigs: RaccoonState["commandConfigs"]
  rules: RaccoonState["rules"]
  defaultModel: RaccoonState["defaultModel"]
  modeModels: RaccoonState["modeModels"]
  mcpMarketplace: RaccoonState["mcpMarketplace"]
  mcpInstalled: RaccoonState["mcpInstalled"]
  skillMarketplace: RaccoonState["skillMarketplace"]
  skillInstalled: RaccoonState["skillInstalled"]
  providerAuthMethods: RaccoonState["providerAuthMethods"]
  pluginLanguageMode: RaccoonState["pluginLanguageMode"]
  autocompleteEnabled: RaccoonState["autocompleteEnabled"]
  raccoonLoggedIn: RaccoonState["raccoonLoggedIn"]
}

const SessionStateContext = createContext<SessionStateContextValue | undefined>(undefined)
const SessionActionsContext = createContext<SessionActionsContextValue | undefined>(undefined)
const SessionConfigContext = createContext<SessionConfigContextValue | undefined>(undefined)

function normalizeState(state: RaccoonState): RaccoonState {
  return {
    ...initialState,
    ...state,
    sessions: state.sessions ?? [],
    activeSession: state.activeSession,
    messages: (state.messages ?? []).map((item) => ({ ...item, parts: item.parts ?? [] })),
    models: state.models ?? [],
    providers: state.providers ?? [],
    commands: state.commands ?? [],
    commandConfigs: state.commandConfigs ?? [],
    slashCommands: state.slashCommands ?? [],
    customProviders: state.customProviders ?? [],
    mcpMarketplace: state.mcpMarketplace ?? { items: [], installed: { project: {}, user: {} } },
    skillMarketplace: state.skillMarketplace ?? { sources: [], items: [], installed: { project: {}, user: {} } },
    providerAuthMethods: state.providerAuthMethods ?? {},
  }
}

export function SessionProvider(props: { children: ReactNode }) {
  const vscode = useVSCode()
  const [state, setState] = useState<RaccoonState>(() => normalizeState(vscode.getState<RaccoonState>() ?? initialState))
  const [questions, setQuestions] = useState<RaccoonQuestionRequest[]>([])
  const [questionErrors, setQuestionErrors] = useState<Set<string>>(() => new Set())
  const [permissions, setPermissions] = useState<RaccoonPermissionRequest[]>([])
  const [permissionErrors, setPermissionErrors] = useState<Set<string>>(() => new Set())
  const [autoApproveSessions, setAutoApproveSessions] = useState<Set<string>>(() => new Set())
  // Client-only per-conversation model override. Switching the model while a session is active
  // affects only that session's next messages, without changing the global default model.
  const [sessionModels, setSessionModels] = useState<Record<string, { providerID: string; modelID: string }>>({})
  const [sessionVariants, setSessionVariants] = useState<Record<string, string | undefined>>({})
  // Client-only flag: settings is being shown inline in the chat surface (JetBrains) rather than
  // in a dedicated settings webview (VSCode). Drives the Back button and survives state refreshes.
  const [settingsInline, setSettingsInline] = useState(false)
  const stateRef = useRef(state)
  const questionsRef = useRef(questions)
  const permissionsRef = useRef(permissions)
  const autoApproveRef = useRef(autoApproveSessions)
  const settingsInlineRef = useRef(settingsInline)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    settingsInlineRef.current = settingsInline
  }, [settingsInline])

  useEffect(() => {
    questionsRef.current = questions
  }, [questions])

  useEffect(() => {
    permissionsRef.current = permissions
  }, [permissions])

  useEffect(() => {
    autoApproveRef.current = autoApproveSessions
  }, [autoApproveSessions])

  useEffect(() => {
    const unsubscribe = vscode.onMessage((message) => {
      if (message.type === "state") {
        const incoming = normalizeState(message.state)
        setState((current) => {
          // postState() always forces view: "chat". Stay in the sub-agent view if the
          // user opened one — it is driven by dedicated showSubAgent/closeSubAgent messages.
          // Likewise stay in inline settings (JetBrains) across refreshes; it is driven by
          // dedicated showSettings/showChat messages, not by state frames.
          const next =
            current.view === "subagent"
              ? { ...incoming, view: "subagent" as const, subAgentView: current.subAgentView }
              : settingsInlineRef.current && current.view === "settings"
                ? { ...incoming, view: "settings" as const }
                : incoming
          vscode.setState(next)
          return next
        })
        return
      }
      if (message.type === "partUpdated" || message.type === "partsUpdated") {
        const updates = message.type === "partUpdated" ? [message] : message.updates
        setState((current) => {
          const next = { ...current, messages: applyPartUpdates(current.messages, updates) }
          // Don't flip an idle session back to busy — background part updates
          // (e.g. compaction.prune) arrive after session.idle.
          if (current.busy) {
            next.loading = true
            next.busy = true
          }
          if (current.subAgentView) {
            next.subAgentView = { ...current.subAgentView, messages: applyPartUpdates(current.subAgentView.messages, updates) }
          }
          vscode.setState(next)
          return next
        })
        return
      }
      if (message.type === "sessionUpdated") {
        setState((current) => {
          const sessions = current.sessions.map((item) => (item.id === message.session.id ? message.session : item))
          const next = {
            ...current,
            sessions: sessions.some((item) => item.id === message.session.id) ? sessions : [message.session, ...sessions],
            activeSession: current.activeSessionID === message.session.id ? message.session : current.activeSession,
            loading: false,
            busy: false,
          }
          vscode.setState(next)
          return next
        })
        return
      }
      if (message.type === "providerConnectFinished") {
        setState((current) => {
          const next = { ...current, error: message.error ?? current.error, loading: false, busy: false }
          vscode.setState(next)
          return next
        })
        return
      }
      if (message.type === "mcpMarketplaceData") {
        setState((current) => {
          const next = {
            ...current,
            mcpMarketplace: {
              items: message.items,
              installed: message.installed,
              loading: false,
              errors: message.errors,
              lastFetchedAt: Date.now(),
            },
          }
          vscode.setState(next)
          return next
        })
        return
      }
      if (message.type === "skillMarketplaceData") {
        setState((current) => {
          const next = {
            ...current,
            skillMarketplace: {
              sources: message.sources,
              items: message.items,
              installed: message.installed,
              loading: false,
              errors: message.errors,
              lastFetchedAt: Date.now(),
            },
          }
          vscode.setState(next)
          return next
        })
        return
      }
      if (message.type === "mcpInstalledData") {
        setState((current) => {
          const next = {
            ...current,
            mcpInstalled: {
              servers: message.servers,
              loading: false,
              error: message.error,
            },
          }
          vscode.setState(next)
          return next
        })
        return
      }
      if (message.type === "skillInstalledData") {
        setState((current) => {
          const next = {
            ...current,
            skillInstalled: {
              skills: message.skills,
              loading: false,
              error: message.error,
            },
          }
          vscode.setState(next)
          return next
        })
        return
      }
      if (message.type === "questionRequest") {
        setQuestions((current) => {
          const index = current.findIndex((item) => item.id === message.question.id)
          if (index === -1) return [...current, message.question]
          return current.map((item) => (item.id === message.question.id ? message.question : item))
        })
        setQuestionErrors((current) => {
          if (!current.has(message.question.id)) return current
          const next = new Set(current)
          next.delete(message.question.id)
          return next
        })
        return
      }
      if (message.type === "questionResolved") {
        setQuestions((current) => current.filter((item) => item.id !== message.requestID))
        setQuestionErrors((current) => {
          if (!current.has(message.requestID)) return current
          const next = new Set(current)
          next.delete(message.requestID)
          return next
        })
        return
      }
      if (message.type === "questionError") {
        setQuestionErrors((current) => new Set(current).add(message.requestID))
        return
      }
      if (message.type === "permissionRequest") {
        if (autoApproveRef.current.has(message.permission.sessionID)) {
          vscode.postMessage({
            type: "permissionReply",
            requestID: message.permission.id,
            sessionID: message.permission.sessionID,
            reply: "once",
          })
          return
        }
        setPermissions((current) => {
          const index = current.findIndex((item) => item.id === message.permission.id)
          if (index === -1) return [...current, message.permission]
          return current.map((item) => (item.id === message.permission.id ? message.permission : item))
        })
        setPermissionErrors((current) => {
          if (!current.has(message.permission.id)) return current
          const next = new Set(current)
          next.delete(message.permission.id)
          return next
        })
        return
      }
      if (message.type === "permissionResolved") {
        setPermissions((current) => current.filter((item) => item.id !== message.requestID))
        setPermissionErrors((current) => {
          if (!current.has(message.requestID)) return current
          const next = new Set(current)
          next.delete(message.requestID)
          return next
        })
        return
      }
      if (message.type === "permissionError") {
        setPermissionErrors((current) => new Set(current).add(message.requestID))
        return
      }
      if (message.type === "error") {
        setState((current) => {
          const next = { ...current, error: message.message, loading: false, busy: false }
          vscode.setState(next)
          return next
        })
        return
      }
      if (message.type === "showHistory") {
        setSettingsInline(false)
        setState((current) => {
          const next = { ...current, view: "history" as const }
          vscode.setState(next)
          return next
        })
        return
      }
      if (message.type === "showSettings") {
        setSettingsInline(true)
        setState((current) => {
          const next = { ...current, view: "settings" as const }
          vscode.setState(next)
          return next
        })
        return
      }
      if (message.type === "showChat") {
        setSettingsInline(false)
        setState((current) => {
          const next = { ...current, view: "chat" as const }
          vscode.setState(next)
          return next
        })
        return
      }
      if (message.type === "showSubAgent") {
        setState((current) => {
          // Preserve busy state across full refreshes — showSubAgent from
          // refreshSubAgent doesn't carry busy, but the sub-agent may still
          // be working (e.g., a message.removed triggered the refresh).
          const next = { ...current, view: "subagent" as const, subAgentView: { ...message.view, busy: current.subAgentView?.busy } }
          vscode.setState(next)
          return next
        })
        return
      }
      if (message.type === "subAgentMessageUpdated") {
        setState((current) => {
          if (!current.subAgentView) return current
          const messages = current.subAgentView.messages
          const existing = messages.find((m) => m.id === message.message.id)
          // Preserve parts/text from streaming when the message already exists;
          // message.updated fires at step-finish to update tokens/cost, and the
          // incoming message has empty parts that would clobber streamed content.
          const merged = existing ? { ...message.message, parts: existing.parts, text: existing.text } : message.message
          const updatedMessages = existing
            ? messages.map((m) => (m.id === message.message.id ? merged : m))
            : [...messages, message.message]
          const next = { ...current, subAgentView: { ...current.subAgentView, messages: updatedMessages } }
          vscode.setState(next)
          return next
        })
        return
      }
      if (message.type === "subAgentBusyChanged") {
        setState((current) => {
          if (!current.subAgentView) return current
          const next = { ...current, subAgentView: { ...current.subAgentView, busy: message.busy } }
          vscode.setState(next)
          return next
        })
        return
      }
      if (message.type === "closeSubAgent") {
        setState((current) => {
          const next = { ...current, view: "chat" as const, subAgentView: undefined }
          vscode.setState(next)
          return next
        })
        return
      }
      if (message.type === "terminalContextResult" || message.type === "terminalContextError") return
      if (message.type === "gitChangesContextResult" || message.type === "gitChangesContextError") return
      if (message.type === "raccoonLoginFinished") {
        // Only an actual login completion fires this. The extension posts the refreshed
        // `state` (with raccoon connected) before this message, so stateRef holds the
        // logged-in model list/defaults here. Default the selection to Raccoon, preferring
        // the server default for the "raccoon" provider.
        if (message.error) return
        const current = stateRef.current
        const raccoonModels = current.models.filter((model) => model.providerID === "raccoon" && model.enabled && model.connected)
        if (raccoonModels.length === 0) return
        const defaultModelID = current.defaults?.["raccoon"]
        const preferred = raccoonModels.find((model) => model.modelID === defaultModelID) ?? raccoonModels[0]
        if (!preferred) return
        if (current.defaultModel?.providerID === preferred.providerID && current.defaultModel?.modelID === preferred.modelID) return
        const model = { providerID: preferred.providerID, modelID: preferred.modelID }
        setState((state) => {
          const next = { ...state, selectedModel: model, defaultModel: model }
          vscode.setState(next)
          return next
        })
        vscode.postMessage({ type: "setModel", model })
        return
      }
    })

    vscode.postMessage({ type: "webviewReady" })
    return unsubscribe
  }, [vscode])

  const sessionState = useMemo<SessionStateContextValue>(() => {
    const sessions = state.sessions
    const messages = state.messages
    const models = state.models
    const commands = state.commands ?? []
    const commandConfigs = state.commandConfigs ?? []
    const slashCommands = state.slashCommands ?? []
    const enabledModels = models.filter((model) => model.enabled && model.connected)
    const selectedModel = models.find(
      (model) => model.providerID === state.selectedModel?.providerID && model.modelID === state.selectedModel?.modelID,
    )
    const conversationSelection = state.activeSessionID ? sessionModels[state.activeSessionID] : undefined
    const conversationModel = conversationSelection
      ? models.find(
          (model) =>
            model.providerID === conversationSelection.providerID && model.modelID === conversationSelection.modelID,
        ) ?? selectedModel
      : selectedModel
    const conversationVariant = state.activeSessionID
      ? sessionVariants[state.activeSessionID] ?? (conversationModel?.variants?.includes("none") ? "none" : undefined)
      : undefined
    const activeSession = state.activeSession ?? sessions.find((session) => session.id === state.activeSessionID)
    const latestUserMessage = [...messages].reverse().find((message) => message.role === "user")
    const latestAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant")
    const revertMessageID = activeSession?.revert?.messageID
    const revertMessage = revertMessageID ? messages.find((message) => message.id === revertMessageID) : undefined
    const beforeRevert = (message: RaccoonMessage) => {
      if (!revertMessage) return true
      if (message.createdAt !== revertMessage.createdAt) return message.createdAt < revertMessage.createdAt
      return message.id < revertMessage.id
    }
    const visibleMessages = revertMessageID ? messages.filter(beforeRevert) : messages
    const revertedMessages = revertMessageID
      ? messages.filter((message) => message.role === "user" && message.id >= revertMessageID)
      : []

    return {
      state,
      sessions,
      messages,
      models: enabledModels,
      commands,
      commandConfigs,
      slashCommands,
      selectedModel,
      conversationModel,
      conversationVariant,
      activeSession,
      latestUserMessage,
      latestAssistantMessage,
      visibleMessages,
      revertedMessages,
      questions,
      questionErrors,
      permissions,
      permissionErrors,
      autoApprovePermissions: !!state.activeSessionID && autoApproveSessions.has(state.activeSessionID),
      settingsInline,
    }
  }, [questionErrors, questions, permissions, permissionErrors, autoApproveSessions, sessionModels, sessionVariants, state, settingsInline])

  const sessionConfig = useMemo<SessionConfigContextValue>(() => {
    return {
      agents: state.agents,
      models: state.models,
      providers: state.providers,
      customProviders: state.customProviders,
      commands: state.commands,
      commandConfigs: state.commandConfigs,
      rules: state.rules,
      defaultModel: state.defaultModel,
      modeModels: state.modeModels,
      mcpMarketplace: state.mcpMarketplace,
      mcpInstalled: state.mcpInstalled,
      skillMarketplace: state.skillMarketplace,
      skillInstalled: state.skillInstalled,
      providerAuthMethods: state.providerAuthMethods,
      pluginLanguageMode: state.pluginLanguageMode,
      autocompleteEnabled: state.autocompleteEnabled,
      raccoonLoggedIn: state.raccoonLoggedIn,
    }
    // Deliberately depends only on config slices — NOT on `state`, `loading`, or
    // `busy` — so partUpdated streaming does not re-render config consumers.
  }, [
    state.agents,
    state.models,
    state.providers,
    state.customProviders,
    state.commands,
    state.commandConfigs,
    state.rules,
    state.defaultModel,
    state.modeModels,
    state.mcpMarketplace,
    state.mcpInstalled,
    state.skillMarketplace,
    state.skillInstalled,
    state.providerAuthMethods,
    state.pluginLanguageMode,
    state.autocompleteEnabled,
    state.raccoonLoggedIn,
  ])

  const sessionActions = useMemo<SessionActionsContextValue>(() => {
    return {
      canSend: (text, files = []) => (text.trim().length > 0 || files.length > 0) && !stateRef.current.busy,
      showChat: () => {
        setSettingsInline(false)
        setState((current) => {
          const next = { ...current, view: "chat" as const }
          vscode.setState(next)
          return next
        })
      },
      closeSubAgent: () => {
        setState((current) => {
          const next = { ...current, view: "chat" as const, subAgentView: undefined }
          vscode.setState(next)
          return next
        })
        vscode.postMessage({ type: "closeSubAgent" })
      },
      createSession: () => vscode.postMessage({ type: "createSession", mode: stateRef.current.mode }),
      openHistory: () => vscode.postMessage({ type: "openHistory" }),
      openSettings: () => vscode.postMessage({ type: "openSettings" }),
      refresh: () => vscode.postMessage({ type: "refresh" }),
      selectSession: (sessionID) => vscode.postMessage({ type: "selectSession", sessionID }),
      renameSession: (sessionID, title) => vscode.postMessage({ type: "renameSession", sessionID, title }),
      deleteSession: (sessionID) => vscode.postMessage({ type: "deleteSession", sessionID }),
      exportSession: (sessionID) => vscode.postMessage({ type: "exportSession", sessionID }),
      revertSession: (messageID) => {
        if (!stateRef.current.activeSessionID || stateRef.current.busy) return
        vscode.postMessage({ type: "revertSession", sessionID: stateRef.current.activeSessionID, messageID })
      },
      restoreRevertedMessage: (messageID) => {
        if (!stateRef.current.activeSessionID || stateRef.current.busy) return
        const next = stateRef.current.messages.find((item) => item.role === "user" && item.id > messageID)
        if (next) {
          vscode.postMessage({ type: "revertSession", sessionID: stateRef.current.activeSessionID, messageID: next.id })
          return
        }
        vscode.postMessage({ type: "unrevertSession", sessionID: stateRef.current.activeSessionID })
      },
      runSlashCommand: (name) => vscode.postMessage({ type: "runSlashCommand", name }),
      setMode: (mode) => {
        setState((current) => ({ ...current, mode, selectedModel: current.modeModels?.[mode] ?? current.defaultModel ?? current.selectedModel }))
        vscode.postMessage({ type: "setMode", mode })
      },
      setPluginLanguage: (language) => {
        setState((current) => {
          if (language === "auto") return { ...current, pluginLanguageMode: language }
          return { ...current, pluginLanguageMode: language, pluginLanguage: language }
        })
        vscode.postMessage({ type: "setPluginLanguage", language })
      },
      setAutocompleteEnabled: (enabled) => {
        setState((current) => ({ ...current, autocompleteEnabled: enabled }))
        vscode.postMessage({ type: "setAutocompleteEnabled", enabled })
      },
      setModel: (model) => {
        setState((current) => ({ ...current, selectedModel: model, defaultModel: model }))
        vscode.postMessage({ type: "setModel", model })
      },
      setConversationModel: (sessionID, model) => {
        if (!sessionID) return
        setSessionModels((current) => ({ ...current, [sessionID]: model }))
        setSessionVariants((current) => ({ ...current, [sessionID]: undefined }))
      },
      setConversationVariant: (sessionID, variant) => {
        if (!sessionID) return
        setSessionVariants((current) => ({ ...current, [sessionID]: variant }))
      },
      setModeModel: (mode, model) => {
        setState((current) => {
          const modeModels = { ...current.modeModels }
          if (model) modeModels[mode] = model
          else delete modeModels[mode]
          return {
            ...current,
            selectedModel: model && mode === current.mode ? model : current.selectedModel,
            modeModels,
          }
        })
        vscode.postMessage({ type: "setModeModel", mode, model })
      },
      setModelEnabled: (model, enabled) => {
        setState((current) => ({
          ...current,
          models: current.models.map((item) =>
            item.providerID === model.providerID && item.modelID === model.modelID ? { ...item, enabled } : item,
          ),
        }))
        vscode.postMessage({ type: "setModelEnabled", model, enabled })
      },
      setProviderEnabled: (providerID, enabled) => {
        setState((current) => ({
          ...current,
          models: current.models.map((model) => (model.providerID === providerID ? { ...model, enabled } : model)),
          providers: current.providers.map((provider) =>
            provider.id === providerID ? { ...provider, enabledModelCount: enabled ? provider.modelCount : 0 } : provider,
          ),
        }))
        vscode.postMessage({ type: "setProviderEnabled", providerID, enabled })
      },
      loginRaccoon: (serverUrl) => vscode.postMessage({ type: "loginRaccoon", serverUrl }),
      cancelRaccoonLogin: () => vscode.postMessage({ type: "cancelRaccoonLogin" }),
      logoutRaccoon: () => vscode.postMessage({ type: "logoutRaccoon" }),
      configureProvider: (providerID, apiKey) => vscode.postMessage({ type: "configureProvider", providerID, apiKey }),
      configureAgent: (name, agent, scope) => vscode.postMessage({ type: "configureAgent", name, agent, scope }),
      deleteAgent: (name, scope) => vscode.postMessage({ type: "deleteAgent", name, scope }),
      saveRule: (scope, originalName, name, content) =>
        vscode.postMessage({ type: "saveRule", scope, originalName, name, content }),
      toggleRule: (scope, name, enabled) => vscode.postMessage({ type: "toggleRule", scope, name, enabled }),
      deleteRule: (scope, name) => vscode.postMessage({ type: "deleteRule", scope, name }),
      saveCommand: (scope, originalName, command) =>
        vscode.postMessage({ type: "saveCommand", scope, originalName, command }),
      deleteCommand: (scope, name) => vscode.postMessage({ type: "deleteCommand", scope, name }),
      connectProvider: (input) => vscode.postMessage({ type: "connectProvider", ...input }),
      cancelProviderConnect: (providerID) => vscode.postMessage({ type: "cancelProviderConnect", providerID }),
      disconnectProvider: (providerID) => vscode.postMessage({ type: "disconnectProvider", providerID }),
      configureCustomProvider: (input) => vscode.postMessage({ type: "configureCustomProvider", ...input }),
      sendMessage: (text, files, model) => {
        const trimmed = text.trim()
        if (!trimmed && !(files?.length ?? 0)) return
        const sessionID = stateRef.current.activeSessionID
        const variant = sessionID ? sessionVariants[sessionID] : undefined
        const selected = model ?? stateRef.current.selectedModel
        vscode.postMessage({
          type: "sendMessage",
          text: trimmed,
          mode: stateRef.current.mode,
          model: selected ? { ...selected, variant } : undefined,
          files,
        })
      },
      replyToQuestion: (requestID, answers) => {
        setQuestionErrors((current) => {
          if (!current.has(requestID)) return current
          const next = new Set(current)
          next.delete(requestID)
          return next
        })
        vscode.postMessage({
          type: "questionReply",
          requestID,
          sessionID: questionsRef.current.find((item) => item.id === requestID)?.sessionID ?? stateRef.current.activeSessionID,
          answers,
        })
      },
      rejectQuestion: (requestID) => {
        setQuestionErrors((current) => {
          if (!current.has(requestID)) return current
          const next = new Set(current)
          next.delete(requestID)
          return next
        })
        vscode.postMessage({
          type: "questionReject",
          requestID,
          sessionID: questionsRef.current.find((item) => item.id === requestID)?.sessionID ?? stateRef.current.activeSessionID,
        })
      },
      replyToPermission: (requestID, reply) => {
        setPermissionErrors((current) => {
          if (!current.has(requestID)) return current
          const next = new Set(current)
          next.delete(requestID)
          return next
        })
        vscode.postMessage({
          type: "permissionReply",
          requestID,
          sessionID: permissionsRef.current.find((item) => item.id === requestID)?.sessionID ?? stateRef.current.activeSessionID,
          reply,
        })
      },
      toggleAutoApprovePermissions: () => {
        const sessionID = stateRef.current.activeSessionID
        if (!sessionID) return
        const enabling = !autoApproveRef.current.has(sessionID)
        setAutoApproveSessions((current) => {
          const next = new Set(current)
          if (enabling) next.add(sessionID)
          else next.delete(sessionID)
          return next
        })
        if (!enabling) return
        // Auto-approve any prompts already queued for this session.
        const queued = permissionsRef.current.filter((item) => item.sessionID === sessionID)
        if (queued.length === 0) return
        setPermissions((current) => current.filter((item) => item.sessionID !== sessionID))
        queued.forEach((item) => {
          vscode.postMessage({ type: "permissionReply", requestID: item.id, sessionID, reply: "once" })
        })
      },
      openFile: (filePath, line, column) => vscode.postMessage({ type: "openFile", filePath, line, column }),
      openImage: (input) => vscode.postMessage({ type: "openImage", ...input }),
      stopSession: () => vscode.postMessage({ type: "stopSession" }),
    }
  }, [sessionVariants, vscode])

  return (
    <SessionStateContext.Provider value={sessionState}>
      <SessionConfigContext.Provider value={sessionConfig}>
        <SessionActionsContext.Provider value={sessionActions}>{props.children}</SessionActionsContext.Provider>
      </SessionConfigContext.Provider>
    </SessionStateContext.Provider>
  )
}

export function useSessionState() {
  const context = useContext(SessionStateContext)
  if (!context) throw new Error("useSessionState must be used within a SessionProvider")
  return context
}

export function useSessionActions() {
  const context = useContext(SessionActionsContext)
  if (!context) throw new Error("useSessionActions must be used within a SessionProvider")
  return context
}

export function useSessionConfig() {
  const context = useContext(SessionConfigContext)
  if (!context) throw new Error("useSessionConfig must be used within a SessionProvider")
  return context
}

export function useSession() {
  const state = useSessionState()
  const actions = useSessionActions()
  return { ...state, ...actions }
}
