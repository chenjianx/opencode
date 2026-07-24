export type ChatMode = string
export type RaccoonPluginLanguage = "en" | "zh-Hans" | "zh-Hant"
export type RaccoonPluginLanguageMode = "auto" | RaccoonPluginLanguage
export type CustomProviderPackage = "@ai-sdk/openai" | "@ai-sdk/anthropic" | "@ai-sdk/openai-compatible"
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
  permissionConfig?: RaccoonPermissionConfig
  configScope?: RaccoonAgentScope
  model?: {
    providerID: string
    modelID: string
  }
  prompt?: string
  options?: Record<string, unknown>
}

export type RaccoonAgentConfigInput = {
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
  hidden?: boolean
  disable?: boolean
}

export type RaccoonRule = {
  name: string
  scope: RaccoonAgentScope
  enabled: boolean
  content: string
}

export type RaccoonModel = {
  providerID: string
  providerName: string
  modelID: string
  modelName: string
  enabled: boolean
  connected: boolean
  source?: "env" | "config" | "custom" | "api"
  contextLimit?: number
  variants?: string[]
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
  package: CustomProviderPackage
  baseURL: string
  headers?: Record<string, string>
  models: Array<{ id: string; name: string; supportsImage?: boolean }>
}

export type RaccoonCommand = {
  name: string
  description?: string
  source?: "command" | "mcp" | "skill"
  hints: string[]
}

export type RaccoonManagedCommand = {
  name: string
  scope: RaccoonAgentScope
  description?: string
  agent?: string
  model?: string
  subtask?: boolean
  template: string
}

export type RaccoonManagedCommandInput = {
  name: string
  description?: string
  agent?: string
  model?: string
  subtask?: boolean
  template: string
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
  parentID?: string
  agent?: string
  updatedAt: number
  revert?: {
    messageID: string
    partID?: string
    snapshot?: string
    diff?: string
  }
}

export type RaccoonMessageTokens = {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
  total?: number
}

export type RaccoonMessage = {
  id: string
  role: "user" | "assistant" | "system"
  text: string
  parts: RaccoonMessagePart[]
  createdAt: number
  tokens?: RaccoonMessageTokens
  cost?: number
}

export type RaccoonSubSessionTool = {
  id: string
  tool: string
  sessionID?: string
  status?: string
  title?: string
}

export type RaccoonSubSession = {
  sessionID: string
  status: string
  tools: RaccoonSubSessionTool[]
  toolcalls: number
  startedAt?: number
  completedAt?: number
}

export type RaccoonMessagePart = {
  id: string
  type:
    | "text"
    | "reasoning"
    | "tool"
    | "file"
    | "step-start"
    | "step-finish"
    | "snapshot"
    | "patch"
    | "agent"
    | "subtask"
    | "other"
  text?: string
  mime?: string
  filename?: string
  url?: string
  path?: string
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

export type RaccoonPermissionReply = "once" | "always" | "reject"

export type RaccoonMarketplaceScope = "project" | "user"

export type RaccoonMarketplaceHeader = {
  name: string
  description?: string
  placeholder?: string
  isRequired?: boolean
  isSecret?: boolean
}

export type RaccoonMarketplaceEnvironmentVariable = RaccoonMarketplaceHeader

export type RaccoonMarketplaceVariable = RaccoonMarketplaceHeader

export type RaccoonMarketplaceRemote = {
  type: string
  url: string
  headers?: RaccoonMarketplaceHeader[]
}

export type RaccoonMarketplacePackage = {
  registryType: string
  identifier: string
  version?: string
  runtimeHint?: string
  transport?: {
    type: string
  }
  runtimeArguments?: string[]
  environmentVariables?: RaccoonMarketplaceEnvironmentVariable[]
}

export type RaccoonMarketplaceMcpItem = {
  id: string
  name: string
  title?: string
  description: string
  category?: string
  version: string
  websiteUrl?: string
  repositoryUrl?: string
  remotes: RaccoonMarketplaceRemote[]
  packages: RaccoonMarketplacePackage[]
  headers: RaccoonMarketplaceHeader[]
  environmentVariables: RaccoonMarketplaceEnvironmentVariable[]
  variables: RaccoonMarketplaceVariable[]
  transportTypes: Array<"remote" | "package">
  publishedAt?: string
  updatedAt?: string
}

export type RaccoonMarketplaceInstalledMetadata = {
  project: Record<string, { type: "mcp" }>
  user: Record<string, { type: "mcp" }>
}

export type RaccoonSkillMarketplaceSource = {
  id: string
  label: string
  description: string
  source: string
  defaultSubpath?: string
  sourceType: "github"
}

export type RaccoonSkillMarketplaceItem = {
  id: string
  name: string
  title?: string
  description?: string
  category?: string
  sourceID: string
  sourceLabel: string
  repoSource: string
  repoSubpath?: string
  skillDir: string
  installable: boolean
  warnings?: string[]
  repositoryUrl?: string
}

export type RaccoonSkillMarketplaceInstalledMetadata = {
  project: Record<string, { type: "skill" }>
  user: Record<string, { type: "skill" }>
}

export type RaccoonInstalledSkill = {
  id: string
  name: string
  description?: string
  scope: RaccoonMarketplaceScope
  location: string
  builtin?: boolean
  removable: boolean
}

export type RaccoonMcpLocalConfig = {
  type: "local"
  command: string[]
  cwd?: string
  environment?: Record<string, string>
  enabled?: boolean
  timeout?: number
}

export type RaccoonMcpRemoteConfig = {
  type: "remote"
  url: string
  headers?: Record<string, string>
  enabled?: boolean
  timeout?: number
}

export type RaccoonMcpServerConfig = RaccoonMcpLocalConfig | RaccoonMcpRemoteConfig

export type RaccoonMcpStatus =
  | { status: "connected" }
  | { status: "disabled" }
  | { status: "failed"; error: string }
  | { status: "needs_auth" }
  | { status: "needs_client_registration"; error: string }

export type RaccoonInstalledMcp = {
  id: string
  scope: RaccoonMarketplaceScope
  config: RaccoonMcpServerConfig
  status?: RaccoonMcpStatus
}

export type RaccoonPermissionRequest = {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  metadata: Record<string, unknown>
  always: string[]
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

export type RaccoonView = "chat" | "history" | "settings" | "subagent"

export type RaccoonSubAgentView = {
  sessionID: string
  title?: string
  messages: RaccoonMessage[]
  loading?: boolean
  busy?: boolean
  error?: string
}

export type RaccoonState = {
  view?: RaccoonView
  serverUrl?: string
  directory?: string
  raccoonLoggedIn?: boolean
  pluginLanguageMode?: RaccoonPluginLanguageMode
  pluginLanguage?: RaccoonPluginLanguage
  activeSessionID?: string
  activeSession?: RaccoonSession
  sessions: RaccoonSession[]
  messages: RaccoonMessage[]
  subSessions?: Record<string, RaccoonSubSession>
  subAgentView?: RaccoonSubAgentView
  agents: RaccoonAgent[]
  rules?: RaccoonRule[]
  models: RaccoonModel[]
  providers: RaccoonProviderInfo[]
  mcpMarketplace?: {
    items: RaccoonMarketplaceMcpItem[]
    installed: RaccoonMarketplaceInstalledMetadata
    loading?: boolean
    errors?: string[]
    lastFetchedAt?: number
  }
  skillMarketplace?: {
    sources: RaccoonSkillMarketplaceSource[]
    items: RaccoonSkillMarketplaceItem[]
    installed: RaccoonSkillMarketplaceInstalledMetadata
    loading?: boolean
    errors?: string[]
    lastFetchedAt?: number
  }
  skillInstalled?: {
    skills: RaccoonInstalledSkill[]
    loading?: boolean
    error?: string
  }
  mcpInstalled?: {
    servers: RaccoonInstalledMcp[]
    loading?: boolean
    error?: string
  }
  defaults?: Record<string, string>
  commands?: RaccoonCommand[]
  commandConfigs?: RaccoonManagedCommand[]
  slashCommands?: RaccoonSlashCommand[]
  providerAuthMethods?: Record<string, RaccoonProviderAuthMethod[]>
  customProviders?: RaccoonCustomProvider[]
  selectedModel?: {
    providerID: string
    modelID: string
  }
  defaultModel?: {
    providerID: string
    modelID: string
  }
  modeModels?: Partial<Record<ChatMode, { providerID: string; modelID: string }>>
  autocompleteEnabled?: boolean
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
  | { type: "openSubAgent"; sessionID: string; title?: string }
  | { type: "closeSubAgent" }
  | { type: "renameSession"; sessionID: string; title: string }
  | { type: "deleteSession"; sessionID: string }
  | { type: "exportSession"; sessionID: string }
  | { type: "revertSession"; sessionID: string; messageID: string }
  | { type: "unrevertSession"; sessionID: string }
  | { type: "runSlashCommand"; name: string }
  | { type: "setMode"; mode: ChatMode }
  | { type: "setPluginLanguage"; language: RaccoonPluginLanguageMode }
  | { type: "setAutocompleteEnabled"; enabled: boolean }
  | { type: "setModel"; model: { providerID: string; modelID: string } }
  | { type: "setModeModel"; mode: ChatMode; model?: { providerID: string; modelID: string } }
  | {
      type: "saveSettings"
      requestID: string
      settings: {
        defaultModel?: { providerID: string; modelID: string }
        modeModels?: Partial<Record<ChatMode, { providerID: string; modelID: string } | undefined>>
        pluginLanguageMode?: RaccoonPluginLanguageMode
        autocompleteEnabled?: boolean
      }
    }
  | { type: "setModelEnabled"; model: { providerID: string; modelID: string }; enabled: boolean }
  | { type: "setProviderEnabled"; providerID: string; enabled: boolean }
  | { type: "loginRaccoon"; serverUrl?: string }
  | { type: "cancelRaccoonLogin" }
  | { type: "logoutRaccoon" }
  | { type: "configureProvider"; providerID: string; apiKey: string }
  | {
      type: "configureAgent"
      requestID: string
      original?: { name: string; scope: RaccoonAgentScope }
      scope: RaccoonAgentScope
      agent: RaccoonAgentConfigInput
    }
  | { type: "deleteAgent"; requestID: string; name: string; scope: RaccoonAgentScope }
  | { type: "saveRule"; requestID: string; scope: RaccoonAgentScope; originalName: string; name: string; content: string }
  | { type: "toggleRule"; requestID: string; scope: RaccoonAgentScope; name: string; enabled: boolean }
  | { type: "deleteRule"; requestID: string; scope: RaccoonAgentScope; name: string }
  | {
      type: "saveCommand"
      requestID: string
      scope: RaccoonAgentScope
      originalName: string
      command: RaccoonManagedCommandInput
    }
  | { type: "deleteCommand"; requestID: string; scope: RaccoonAgentScope; name: string }
  | {
      type: "connectProvider"
      providerID: string
      methodIndex?: number
      apiKey?: string
      inputs?: Record<string, string>
    }
  | { type: "cancelProviderConnect"; providerID?: string }
  | { type: "disconnectProvider"; providerID: string }
  | {
      type: "fetchCustomProviderModels"
      requestID: string
      baseURL: string
      apiKey?: string
      headers?: Record<string, string>
    }
  | { type: "fetchMcpMarketplace"; force?: boolean }
  | { type: "fetchSkillMarketplace"; force?: boolean }
  | {
      type: "installMcpMarketplaceItem"
      item: RaccoonMarketplaceMcpItem
      options: {
        scope: RaccoonMarketplaceScope
        transport?: "remote" | "package"
        headers?: Record<string, string>
        environment?: Record<string, string>
        variables?: Record<string, string>
      }
    }
  | { type: "removeMcpMarketplaceItem"; item: RaccoonMarketplaceMcpItem; scope: RaccoonMarketplaceScope }
  | {
      type: "installSkillMarketplaceItem"
      item: RaccoonSkillMarketplaceItem
      options: {
        scope: RaccoonMarketplaceScope
      }
    }
  | { type: "removeSkillMarketplaceItem"; item: RaccoonSkillMarketplaceItem; scope: RaccoonMarketplaceScope }
  | { type: "addMcpServerManual"; id: string; config: RaccoonMcpServerConfig; scope: RaccoonMarketplaceScope }
  | { type: "fetchMcpInstalled" }
  | { type: "fetchSkillInstalled" }
  | { type: "setMcpServerEnabled"; id: string; scope: RaccoonMarketplaceScope; enabled: boolean }
  | { type: "connectMcpServer"; id: string }
  | { type: "disconnectMcpServer"; id: string }
  | { type: "removeMcpServer"; id: string; scope: RaccoonMarketplaceScope }
  | { type: "updateMcpServer"; id: string; scope: RaccoonMarketplaceScope; config: RaccoonMcpServerConfig }
  | { type: "requestFileSearch"; requestID: string; query: string; kind?: "file" | "folder" }
  | { type: "openFile"; filePath: string; line?: number; column?: number }
  | { type: "openImage"; url: string; filename?: string; mime?: string }
  | { type: "requestTerminalContext"; requestID: string; sessionID?: string }
  | { type: "requestGitChangesContext"; requestID: string; sessionID?: string }
  | { type: "questionReply"; requestID: string; sessionID?: string; answers: string[][] }
  | { type: "questionReject"; requestID: string; sessionID?: string }
  | { type: "permissionReply"; requestID: string; sessionID?: string; reply: RaccoonPermissionReply }
  | {
      type: "configureCustomProvider"
      providerID: string
      name: string
      package: CustomProviderPackage
      baseURL: string
      apiKey: string
      headers?: Record<string, string>
      models: Array<{ id: string; name: string; supportsImage?: boolean }>
    }
  | { type: "deleteCustomProvider"; providerID: string }
  | {
      type: "sendMessage"
      sessionID: string | undefined
      text: string
      mode: ChatMode
      model?: { providerID: string; modelID: string; variant?: string }
      files?: RaccoonFileAttachment[]
    }
  | { type: "stopSession" }

export type ExtensionToWebview =
  | { type: "state"; state: RaccoonState }
  | { type: "sessionUpdated"; session: RaccoonSession }
  | ({ type: "partUpdated" } & RaccoonPartUpdate)
  | { type: "partsUpdated"; updates: RaccoonPartUpdate[] }
  | { type: "showHistory" }
  | { type: "showSettings" }
  | { type: "showChat" }
  | { type: "showSubAgent"; view: RaccoonSubAgentView }
  | { type: "subAgentMessageUpdated"; message: RaccoonMessage }
  | { type: "subAgentBusyChanged"; busy: boolean }
  | { type: "closeSubAgent" }
  | {
      type: "customProviderModelsFetched"
      requestID: string
      models?: Array<{ id: string; name: string; supportsImage?: boolean }>
      error?: string
      auth?: boolean
    }
  | {
      type: "mcpMarketplaceData"
      items: RaccoonMarketplaceMcpItem[]
      installed: RaccoonMarketplaceInstalledMetadata
      errors?: string[]
    }
  | {
      type: "skillMarketplaceData"
      sources: RaccoonSkillMarketplaceSource[]
      items: RaccoonSkillMarketplaceItem[]
      installed: RaccoonSkillMarketplaceInstalledMetadata
      errors?: string[]
    }
  | {
      type: "mcpMarketplaceInstallResult"
      id: string
      scope?: RaccoonMarketplaceScope
      success: boolean
      error?: string
    }
  | {
      type: "mcpMarketplaceRemoveResult"
      id: string
      scope?: RaccoonMarketplaceScope
      success: boolean
      error?: string
    }
  | {
      type: "skillMarketplaceInstallResult"
      id: string
      scope?: RaccoonMarketplaceScope
      success: boolean
      error?: string
    }
  | {
      type: "skillMarketplaceRemoveResult"
      id: string
      scope?: RaccoonMarketplaceScope
      success: boolean
      error?: string
    }
  | { type: "mcpManualAddResult"; id: string; scope?: RaccoonMarketplaceScope; success: boolean; error?: string }
  | { type: "mcpInstalledData"; servers: RaccoonInstalledMcp[]; error?: string }
  | { type: "skillInstalledData"; skills: RaccoonInstalledSkill[]; error?: string }
  | { type: "mcpServerActionResult"; id: string; success: boolean; error?: string }
  | {
      type: "fileSearchResult"
      requestID: string
      items: RaccoonFileSearchItem[]
      workspaceDir?: string
    }
  | { type: "questionRequest"; question: RaccoonQuestionRequest }
  | { type: "questionResolved"; requestID: string }
  | { type: "questionError"; requestID: string }
  | { type: "permissionRequest"; permission: RaccoonPermissionRequest }
  | { type: "permissionResolved"; requestID: string }
  | { type: "permissionError"; requestID: string }
  | { type: "appendPrompt"; text: string; replace?: boolean }
  | { type: "terminalContextResult"; requestID: string; content: string }
  | { type: "terminalContextError"; requestID: string; error: string }
  | { type: "gitChangesContextResult"; requestID: string; content: string }
  | { type: "gitChangesContextError"; requestID: string; error: string }
  | { type: "customProviderSaved"; providerID: string }
  | { type: "settingsSaveResult"; requestID: string; success: boolean; error?: string }
  | {
      type: "agentSaveResult"
      requestID: string
      success: boolean
      name?: string
      scope?: RaccoonAgentScope
      error?: string
    }
  | { type: "agentDeleteResult"; requestID: string; success: boolean; error?: string }
  | { type: "ruleSaveResult"; requestID: string; success: boolean; error?: string }
  | { type: "ruleToggleResult"; requestID: string; success: boolean; error?: string }
  | { type: "ruleDeleteResult"; requestID: string; success: boolean; error?: string }
  | { type: "commandSaveResult"; requestID: string; success: boolean; error?: string }
  | { type: "commandDeleteResult"; requestID: string; success: boolean; error?: string }
  | { type: "providerConnectFinished"; providerID: string; error?: string }
  | { type: "raccoonLoginFinished"; error?: string }
  | { type: "error"; message: string }
