import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type {
  ChatMode,
  RaccoonCommand,
  RaccoonFileAttachment,
  RaccoonMessage,
  RaccoonModel,
  RaccoonSession,
  RaccoonSlashCommand,
  RaccoonState,
} from "../protocol"
import { useVSCode } from "./vscode"
import { applyPartUpdates } from "./session-parts"

const initialState: RaccoonState = {
  sessions: [],
  messages: [],
  models: [],
  providers: [],
  commands: [],
  slashCommands: [],
  customProviders: [],
  mode: "build",
  loading: true,
}

type SessionContextValue = {
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
  canSend: (text: string) => boolean
  visibleMessages: RaccoonMessage[]
  revertedMessages: RaccoonMessage[]
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
  setModel: (model: { providerID: string; modelID: string }) => void
  setModeModel: (mode: ChatMode, model: { providerID: string; modelID: string }) => void
  setModelEnabled: (model: { providerID: string; modelID: string }, enabled: boolean) => void
  setProviderEnabled: (providerID: string, enabled: boolean) => void
  loginRaccoon: (serverUrl?: string) => void
  cancelRaccoonLogin: () => void
  configureProvider: (providerID: string, apiKey: string) => void
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
  sendMessage: (text: string, files?: RaccoonFileAttachment[]) => void
  openFile: (filePath: string, line?: number, column?: number) => void
  stopSession: () => void
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined)

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
      if (message.type === "error") {
        setState((current) => {
          const next = { ...current, error: message.message, loading: false }
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

  const value = useMemo<SessionContextValue>(() => {
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
      canSend: (text) => text.trim().length > 0 && !!state.activeSessionID && !state.busy,
      createSession: () => vscode.postMessage({ type: "createSession", mode: state.mode }),
      openHistory: () => vscode.postMessage({ type: "openHistory" }),
      openSettings: () => vscode.postMessage({ type: "openSettings" }),
      refresh: () => vscode.postMessage({ type: "refresh" }),
      selectSession: (sessionID) => vscode.postMessage({ type: "selectSession", sessionID }),
      renameSession: (sessionID, title) => vscode.postMessage({ type: "renameSession", sessionID, title }),
      deleteSession: (sessionID) => vscode.postMessage({ type: "deleteSession", sessionID }),
      exportSession: (sessionID) => vscode.postMessage({ type: "exportSession", sessionID }),
      revertSession: (messageID) => {
        if (!state.activeSessionID || state.busy) return
        vscode.postMessage({ type: "revertSession", sessionID: state.activeSessionID, messageID })
      },
      restoreRevertedMessage: (messageID) => {
        if (!state.activeSessionID || state.busy) return
        const next = messages.find((item) => item.role === "user" && item.id > messageID)
        if (next) {
          vscode.postMessage({ type: "revertSession", sessionID: state.activeSessionID, messageID: next.id })
          return
        }
        vscode.postMessage({ type: "unrevertSession", sessionID: state.activeSessionID })
      },
      runSlashCommand: (name) => vscode.postMessage({ type: "runSlashCommand", name }),
      setMode: (mode) => {
        setState((current) => ({ ...current, mode, selectedModel: current.modeModels?.[mode] ?? current.selectedModel }))
        vscode.postMessage({ type: "setMode", mode })
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
      connectProvider: (input) => vscode.postMessage({ type: "connectProvider", ...input }),
      cancelProviderConnect: (providerID) => vscode.postMessage({ type: "cancelProviderConnect", providerID }),
      configureCustomProvider: (input) => vscode.postMessage({ type: "configureCustomProvider", ...input }),
      sendMessage: (text, files) => {
        const trimmed = text.trim()
        if (!trimmed) return
        vscode.postMessage({ type: "sendMessage", text: trimmed, mode: state.mode, model: state.selectedModel, files })
      },
      openFile: (filePath, line, column) => vscode.postMessage({ type: "openFile", filePath, line, column }),
      stopSession: () => vscode.postMessage({ type: "stopSession" }),
    }
  }, [state, vscode])

  return <SessionContext.Provider value={value}>{props.children}</SessionContext.Provider>
}

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) throw new Error("useSession must be used within a SessionProvider")
  return context
}
