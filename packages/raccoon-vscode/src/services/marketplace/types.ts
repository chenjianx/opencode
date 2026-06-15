export type MarketplaceScope = "project" | "user"

export type RegistryTransportType = "remote" | "package"

export type RegistryHeader = {
  name: string
  description?: string
  placeholder?: string
  isRequired?: boolean
  isSecret?: boolean
}

export type RegistryEnvironmentVariable = RegistryHeader

// A {{TOKEN}} placeholder substituted textually into command args / remote urls.
export type RegistryVariable = RegistryHeader

export type RegistryRemote = {
  type: string
  url: string
  headers?: RegistryHeader[]
}

export type RegistryPackage = {
  registryType: string
  identifier: string
  version?: string
  runtimeHint?: string
  transport?: {
    type: string
  }
  // Full command template (executable + args) with {{TOKEN}} placeholders intact.
  // When present it is authoritative; identifier/version are only used as fallback.
  runtimeArguments?: string[]
  environmentVariables?: RegistryEnvironmentVariable[]
}

export type MarketplaceMcpItem = {
  id: string
  name: string
  title?: string
  description: string
  version: string
  websiteUrl?: string
  repositoryUrl?: string
  remotes: RegistryRemote[]
  packages: RegistryPackage[]
  headers: RegistryHeader[]
  environmentVariables: RegistryEnvironmentVariable[]
  variables: RegistryVariable[]
  transportTypes: RegistryTransportType[]
  publishedAt?: string
  updatedAt?: string
}

export type MarketplaceInstalledMetadata = {
  project: Record<string, { type: "mcp" }>
  user: Record<string, { type: "mcp" }>
}

export type MarketplaceDataResponse = {
  items: MarketplaceMcpItem[]
  installed: MarketplaceInstalledMetadata
  errors?: string[]
}

export type MarketplaceInstallOptions = {
  scope: MarketplaceScope
  transport?: RegistryTransportType
  headers?: Record<string, string>
  environment?: Record<string, string>
  variables?: Record<string, string>
}

export type McpLocalConfig = {
  type: "local"
  command: string[]
  cwd?: string
  environment?: Record<string, string>
  enabled?: boolean
  timeout?: number
}

export type McpRemoteConfig = {
  type: "remote"
  url: string
  headers?: Record<string, string>
  enabled?: boolean
  timeout?: number
}

export type McpServerConfig = McpLocalConfig | McpRemoteConfig

export type McpStatus =
  | { status: "connected" }
  | { status: "disabled" }
  | { status: "failed"; error: string }
  | { status: "needs_auth" }
  | { status: "needs_client_registration"; error: string }

export type MarketplaceInstalledServer = {
  id: string
  scope: MarketplaceScope
  config: McpServerConfig
}

export type MarketplaceManualInstall = {
  id: string
  config: McpServerConfig
  scope: MarketplaceScope
}

export type MarketplaceInstallResult = {
  success: boolean
  id: string
  scope?: MarketplaceScope
  error?: string
}

export type MarketplaceRemoveResult = {
  success: boolean
  id: string
  scope?: MarketplaceScope
  error?: string
}
