import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type {
  ChatMode,
  RaccoonCommand,
  RaccoonAgentScope,
  RaccoonAgentMode,
  RaccoonPermissionConfig,
  RaccoonFileAttachment,
  RaccoonMessage,
  RaccoonModel,
  RaccoonPluginLanguage,
  RaccoonPluginLanguageMode,
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
  slashCommands: [],
  customProviders: [],
  mode: "build",
  loading: true,
}

type SessionStateContextValue = {
  state: RaccoonState
  sessions: RaccoonSession[]
  messages: RaccoonMessage[]
  models: RaccoonModel[]
  commands: RaccoonCommand[]
  slashCommands: RaccoonSlashCommand[]
  selectedModel?: RaccoonModel
  activeSession?: RaccoonSession
  latestUserMessage?: RaccoonMessage
  latestAssistantMessage?: RaccoonMessage
  visibleMessages: RaccoonMessage[]
  revertedMessages: RaccoonMessage[]
  questions: RaccoonQuestionRequest[]
  questionErrors: Set<string>
}

type SessionActionsContextValue = {
  canSend: (text: string, files?: RaccoonFileAttachment[]) => boolean
  showChat: () => void
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
  setModel: (model: { providerID: string; modelID: string }) => void
  setModeModel: (mode: ChatMode, model: { providerID: string; modelID: string }) => void
  setModelEnabled: (model: { providerID: string; modelID: string }, enabled: boolean) => void
  setProviderEnabled: (providerID: string, enabled: boolean) => void
  loginRaccoon: (serverUrl?: string) => void
  cancelRaccoonLogin: () => void
  configureProvider: (providerID: string, apiKey: string) => void
  configureAgent: (
    name: string,
    agent: {
      name?: string
      description?: string
      mode?: RaccoonAgentMode
      model?: { providerID: string; modelID: string }
      temperature?: number
      topP?: number
      variant?: string
      steps?: number
      prompt?: string
      permission?: RaccoonPermissionConfig
      disable?: boolean
    },
    scope: RaccoonAgentScope,
  ) => void
  deleteAgent: (name: string, scope: RaccoonAgentScope) => void
  connectProvider: (input: {
    providerID: string
    methodIndex?: number
    apiKey?: string
    inputs?: Record<string, string>
  }) => void
  cancelProviderConnect: (providerID?: string) => void
  configureCustomProvider: (input: {
    providerID: string
    name: string
    baseURL: string
    apiKey: string
    models: Array<{ id: string; name: string }>
    editing?: boolean
  }) => void
  sendMessage: (text: string, files?: RaccoonFileAttachment[], model?: { providerID: string; modelID: string }) => void
  replyToQuestion: (requestID: string, answers: string[][]) => void
  rejectQuestion: (requestID: string) => void
  openFile: (filePath: string, line?: number, column?: number) => void
  openImage: (input: { url: string; filename?: string; mime?: string }) => void
  stopSession: () => void
}

type SessionContextValue = SessionStateContextValue & SessionActionsContextValue

const SessionStateContext = createContext<SessionStateContextValue | undefined>(undefined)
const SessionActionsContext = createContext<SessionActionsContextValue | undefined>(undefined)

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
    slashCommands: state.slashCommands ?? [],
    customProviders: state.customProviders ?? [],
    providerAuthMethods: state.providerAuthMethods ?? {},
  }
}

export function SessionProvider(props: { children: ReactNode }) {
  const vscode = useVSCode()
  const [state, setState] = useState<RaccoonState>(() => normalizeState(vscode.getState<RaccoonState>() ?? initialState))
  const [questions, setQuestions] = useState<RaccoonQuestionRequest[]>([])
  const [questionErrors, setQuestionErrors] = useState<Set<string>>(() => new Set())
  const stateRef = useRef(state)
  const questionsRef = useRef(questions)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    questionsRef.current = questions
  }, [questions])

  useEffect(() => {
    const unsubscribe = vscode.onMessage((message) => {
      if (message.type === "state") {
        const next = normalizeState(message.state)
        setState(next)
        vscode.setState(next)
        return
      }
      if (message.type === "partUpdated" || message.type === "partsUpdated") {
        const updates = message.type === "partUpdated" ? [message] : message.updates
        setState((current) => {
          const next = { ...current, messages: applyPartUpdates(current.messages, updates), loading: true, busy: true }
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
      if (message.type === "error") {
        setState((current) => {
          const next = { ...current, error: message.message, loading: false }
          vscode.setState(next)
          return next
        })
        return
      }
      if (message.type === "showHistory") {
        setState((current) => {
          const next = { ...current, view: "history" as const }
          vscode.setState(next)
          return next
        })
        return
      }
      if (message.type === "terminalContextResult" || message.type === "terminalContextError") return
      if (message.type === "gitChangesContextResult" || message.type === "gitChangesContextError") return
    })

    vscode.postMessage({ type: "webviewReady" })
    return unsubscribe
  }, [vscode])

  const sessionState = useMemo<SessionStateContextValue>(() => {
    const sessions = state.sessions
    const messages = state.messages
    const models = state.models
    const commands = state.commands ?? []
    const slashCommands = state.slashCommands ?? []
    const enabledModels = models.filter((model) => model.enabled && model.connected)
    const selectedModel = models.find(
      (model) => model.providerID === state.selectedModel?.providerID && model.modelID === state.selectedModel?.modelID,
    )
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
      slashCommands,
      selectedModel,
      activeSession,
      latestUserMessage,
      latestAssistantMessage,
      visibleMessages,
      revertedMessages,
      questions,
      questionErrors,
    }
  }, [questionErrors, questions, state])

  const sessionActions = useMemo<SessionActionsContextValue>(() => {
    return {
      canSend: (text, files = []) => (text.trim().length > 0 || files.length > 0) && !!stateRef.current.activeSessionID && !stateRef.current.busy,
      showChat: () => {
        setState((current) => {
          const next = { ...current, view: "chat" as const }
          vscode.setState(next)
          return next
        })
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
        setState((current) => ({ ...current, mode, selectedModel: current.modeModels?.[mode] ?? current.selectedModel }))
        vscode.postMessage({ type: "setMode", mode })
      },
      setPluginLanguage: (language) => {
        setState((current) => {
          if (language === "auto") return { ...current, pluginLanguageMode: language }
          return { ...current, pluginLanguageMode: language, pluginLanguage: language }
        })
        vscode.postMessage({ type: "setPluginLanguage", language })
      },
      setModel: (model) => {
        setState((current) => ({ ...current, selectedModel: model }))
        vscode.postMessage({ type: "setModel", model })
      },
      setModeModel: (mode, model) => {
        setState((current) => ({
          ...current,
          selectedModel: mode === current.mode ? model : current.selectedModel,
          modeModels: { ...current.modeModels, [mode]: model },
        }))
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
      configureProvider: (providerID, apiKey) => vscode.postMessage({ type: "configureProvider", providerID, apiKey }),
      configureAgent: (name, agent, scope) => vscode.postMessage({ type: "configureAgent", name, agent, scope }),
      deleteAgent: (name, scope) => vscode.postMessage({ type: "deleteAgent", name, scope }),
      connectProvider: (input) => vscode.postMessage({ type: "connectProvider", ...input }),
      cancelProviderConnect: (providerID) => vscode.postMessage({ type: "cancelProviderConnect", providerID }),
      configureCustomProvider: (input) => vscode.postMessage({ type: "configureCustomProvider", ...input }),
      sendMessage: (text, files, model) => {
        const trimmed = text.trim()
        if (!trimmed && !(files?.length ?? 0)) return
        vscode.postMessage({ type: "sendMessage", text: trimmed, mode: stateRef.current.mode, model: model ?? stateRef.current.selectedModel, files })
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
      openFile: (filePath, line, column) => vscode.postMessage({ type: "openFile", filePath, line, column }),
      openImage: (input) => vscode.postMessage({ type: "openImage", ...input }),
      stopSession: () => vscode.postMessage({ type: "stopSession" }),
    }
  }, [vscode])

  return (
    <SessionStateContext.Provider value={sessionState}>
      <SessionActionsContext.Provider value={sessionActions}>{props.children}</SessionActionsContext.Provider>
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

export function useSession() {
  const state = useSessionState()
  const actions = useSessionActions()
  return { ...state, ...actions }
}
