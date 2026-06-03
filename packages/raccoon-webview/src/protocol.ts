export type ChatMode = string
export type RaccoonPluginLanguage = "en" | "zh-Hans" | "zh-Hant"
export type RaccoonPluginLanguageMode = "auto" | RaccoonPluginLanguage
export type RaccoonAgentMode = "subagent" | "primary" | "all"
export type RaccoonAgentScope = "project" | "user"
export type RaccoonPermissionAction = "allow" | "ask" | "deny"
export type RaccoonPermissionConfig = Record<string, RaccoonPermissionAction | Record<string, RaccoonPermissionAction>>
export type RaccoonPermissionRule = {
  permission: string
  pattern: string
  action: RaccoonPermissionAction
}

export type RaccoonAgent = {
  name: string
  description?: string
  mode: RaccoonAgentMode
  native?: boolean
  hidden?: boolean
  temperature?: number
  topP?: number
  variant?: string
  steps?: number
  color?: string
  permission?: RaccoonPermissionRule[]
  model?: {
    providerID: string
    modelID: string
  }
  prompt?: string
  options?: Record<string, unknown>
}

export type RaccoonModel = {
  providerID: string
  providerName: string
  modelID: string
  modelName: string
  enabled: boolean
  connected: boolean
  source?: "env" | "config" | "custom" | "api"
}

export type RaccoonProviderInfo = {
  id: string
  name: string
  source?: "env" | "config" | "custom" | "api"
  connected: boolean
  modelCount: number
  enabledModelCount: number
}

export type RaccoonProviderAuthMethod = {
  type: "oauth" | "api"
  label: string
  prompts?: Array<
    | {
        type: "text"
        key: string
        message: string
        placeholder?: string
        when?: {
          key: string
          op: "eq" | "neq"
          value: string
        }
      }
    | {
        type: "select"
        key: string
        message: string
        options: Array<{
          label: string
          value: string
          hint?: string
        }>
        when?: {
          key: string
          op: "eq" | "neq"
          value: string
        }
      }
  >
}

export type RaccoonCustomProvider = {
  providerID: string
  name: string
  baseURL: string
  models: Array<{ id: string; name: string; supportsImage?: boolean }>
}

export type RaccoonCommand = {
  name: string
  description?: string
  source?: "command" | "mcp" | "skill"
  hints: string[]
}

export type RaccoonSlashCommand = {
  name: string
  description?: string
  source: "command" | "mcp" | "skill" | "ui"
  mode: "prompt" | "action"
  aliases?: string[]
}

export type RaccoonFileSearchItem = {
  path: string
  type: "file" | "folder" | "opened-file" | "terminal" | "git-changes" | "file-group" | "folder-group"
  label?: string
  description?: string
}

export type RaccoonFileAttachment = {
  path: string
  url: string
  filename?: string
  mime?: string
  source?: {
    type: "file"
    path: string
    text: {
      value: string
      start: number
      end: number
    }
  }
}

export type RaccoonSession = {
  id: string
  title: string
  agent?: string
  updatedAt: number
  revert?: {
    messageID: string
    partID?: string
    snapshot?: string
    diff?: string
  }
}

export type RaccoonMessage = {
  id: string
  role: "user" | "assistant" | "system"
  text: string
  parts: RaccoonMessagePart[]
  createdAt: number
}

export type RaccoonMessagePart = {
  id: string
  type: "text" | "reasoning" | "tool" | "file" | "step-start" | "step-finish" | "snapshot" | "patch" | "agent" | "subtask" | "other"
  text?: string
  mime?: string
  filename?: string
  url?: string
  tool?: string
  status?: string
  title?: string
  summary?: string
  input?: Record<string, unknown>
  output?: string
  error?: string
  metadata?: Record<string, unknown>
  synthetic?: boolean
  ignored?: boolean
}

export type RaccoonQuestionOption = {
  label: string
  description: string
  labelKey?: string
  descriptionKey?: string
}

export type RaccoonQuestionInfo = {
  question: string
  header: string
  options: RaccoonQuestionOption[]
  multiple?: boolean
  custom?: boolean
  questionKey?: string
  headerKey?: string
}

export type RaccoonQuestionRequest = {
  id: string
  sessionID: string
  questions: RaccoonQuestionInfo[]
  tool?: {
    messageID: string
    callID: string
  }
}

export type RaccoonPartDelta = {
  type: "text-delta"
  textDelta: string
}

export type RaccoonPartUpdate = {
  messageID: string
  part: RaccoonMessagePart
  delta?: RaccoonPartDelta
}

export type RaccoonView = "chat" | "history" | "settings"

export type RaccoonState = {
  view?: RaccoonView
  serverUrl?: string
  directory?: string
  pluginLanguageMode?: RaccoonPluginLanguageMode
  pluginLanguage?: RaccoonPluginLanguage
  activeSessionID?: string
  activeSession?: RaccoonSession
  sessions: RaccoonSession[]
  messages: RaccoonMessage[]
  agents: RaccoonAgent[]
  models: RaccoonModel[]
  providers: RaccoonProviderInfo[]
  commands?: RaccoonCommand[]
  slashCommands?: RaccoonSlashCommand[]
  providerAuthMethods?: Record<string, RaccoonProviderAuthMethod[]>
  customProviders?: RaccoonCustomProvider[]
  selectedModel?: {
    providerID: string
    modelID: string
  }
  modeModels?: Partial<Record<ChatMode, { providerID: string; modelID: string }>>
  mode: ChatMode
  loading: boolean
  busy?: boolean
  error?: string
}

export type WebviewToExtension =
  | { type: "webviewReady" }
  | { type: "ready" }
  | { type: "refresh" }
  | { type: "createSession"; mode: ChatMode }
  | { type: "openHistory" }
  | { type: "openSettings" }
  | { type: "closeSettings" }
  | { type: "selectSession"; sessionID: string }
  | { type: "renameSession"; sessionID: string; title: string }
  | { type: "deleteSession"; sessionID: string }
  | { type: "exportSession"; sessionID: string }
  | { type: "revertSession"; sessionID: string; messageID: string }
  | { type: "unrevertSession"; sessionID: string }
  | { type: "runSlashCommand"; name: string }
  | { type: "setMode"; mode: ChatMode }
  | { type: "setPluginLanguage"; language: RaccoonPluginLanguageMode }
  | { type: "setModel"; model: { providerID: string; modelID: string } }
  | { type: "setModeModel"; mode: ChatMode; model: { providerID: string; modelID: string } }
  | { type: "setModelEnabled"; model: { providerID: string; modelID: string }; enabled: boolean }
  | { type: "setProviderEnabled"; providerID: string; enabled: boolean }
  | { type: "loginRaccoon"; serverUrl?: string }
  | { type: "cancelRaccoonLogin" }
  | { type: "configureProvider"; providerID: string; apiKey: string }
  | {
      type: "configureAgent"
      name: string
      scope: RaccoonAgentScope
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
      }
    }
  | { type: "deleteAgent"; name: string; scope: RaccoonAgentScope }
  | {
      type: "connectProvider"
      providerID: string
      methodIndex?: number
      apiKey?: string
      inputs?: Record<string, string>
    }
  | { type: "cancelProviderConnect"; providerID?: string }
  | { type: "fetchCustomProviderModels"; requestID: string; baseURL: string; apiKey?: string }
  | { type: "requestFileSearch"; requestID: string; query: string; kind?: "file" | "folder" }
  | { type: "openFile"; filePath: string; line?: number; column?: number }
  | { type: "openImage"; url: string; filename?: string; mime?: string }
  | { type: "requestTerminalContext"; requestID: string; sessionID?: string }
  | { type: "requestGitChangesContext"; requestID: string; sessionID?: string }
  | { type: "questionReply"; requestID: string; sessionID?: string; answers: string[][] }
  | { type: "questionReject"; requestID: string; sessionID?: string }
  | {
      type: "configureCustomProvider"
      providerID: string
      name: string
      baseURL: string
      apiKey: string
      models: Array<{ id: string; name: string; supportsImage?: boolean }>
    }
  | { type: "deleteCustomProvider"; providerID: string }
  | {
      type: "sendMessage"
      text: string
      mode: ChatMode
      model?: { providerID: string; modelID: string }
      files?: RaccoonFileAttachment[]
    }
  | { type: "stopSession" }

export type ExtensionToWebview =
  | { type: "state"; state: RaccoonState }
  | { type: "sessionUpdated"; session: RaccoonSession }
  | ({ type: "partUpdated" } & RaccoonPartUpdate)
  | { type: "partsUpdated"; updates: RaccoonPartUpdate[] }
  | { type: "showHistory" }
  | {
      type: "customProviderModelsFetched"
      requestID: string
      models?: Array<{ id: string; name: string; supportsImage?: boolean }>
      error?: string
      auth?: boolean
    }
  | {
      type: "fileSearchResult"
      requestID: string
      items: RaccoonFileSearchItem[]
      workspaceDir?: string
    }
  | { type: "questionRequest"; question: RaccoonQuestionRequest }
  | { type: "questionResolved"; requestID: string }
  | { type: "questionError"; requestID: string }
  | { type: "appendPrompt"; text: string; replace?: boolean }
  | { type: "terminalContextResult"; requestID: string; content: string }
  | { type: "terminalContextError"; requestID: string; error: string }
  | { type: "gitChangesContextResult"; requestID: string; content: string }
  | { type: "gitChangesContextError"; requestID: string; error: string }
  | { type: "customProviderSaved"; providerID: string }
  | { type: "providerConnectFinished"; providerID: string; error?: string }
  | { type: "raccoonLoginFinished"; error?: string }
  | { type: "error"; message: string }
