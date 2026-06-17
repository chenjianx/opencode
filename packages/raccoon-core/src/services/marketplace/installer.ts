import { applyEdits, modify, parse, type ParseError } from "jsonc-parser/lib/esm/main.js"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import type {
  MarketplaceInstalledMetadata,
  MarketplaceInstalledServer,
  MarketplaceInstallOptions,
  MarketplaceInstallResult,
  MarketplaceManualInstall,
  MarketplaceMcpItem,
  MarketplaceRemoveResult,
  MarketplaceScope,
  McpServerConfig,
} from "./types.js"

const PROJECT_CONFIG_FILES = ["opencode.jsonc", "opencode.json"]
const GLOBAL_CONFIG_FILES = ["opencode.jsonc", "opencode.json", "config.json"]

type McpConfig = McpServerConfig

export class MarketplaceInstaller {
  async detect(client: OpencodeClient, directory: string): Promise<MarketplaceInstalledMetadata> {
    const [project, user] = await Promise.all([
      readMcpIDs(await pickConfigFile(directory, PROJECT_CONFIG_FILES, "opencode.json")),
      this.globalConfigFile(client, directory).then(readMcpIDs),
    ])
    return {
      project: Object.fromEntries(project.map((id) => [id, { type: "mcp" as const }])),
      user: Object.fromEntries(user.map((id) => [id, { type: "mcp" as const }])),
    }
  }

  async listInstalled(client: OpencodeClient, directory: string): Promise<MarketplaceInstalledServer[]> {
    const [project, user] = await Promise.all([
      readMcpEntries(await pickConfigFile(directory, PROJECT_CONFIG_FILES, "opencode.json")),
      this.globalConfigFile(client, directory).then(readMcpEntries),
    ])
    return [
      ...project.map((entry) => ({ ...entry, scope: "project" as const })),
      ...user.map((entry) => ({ ...entry, scope: "user" as const })),
    ]
  }

  async setEnabled(
    client: OpencodeClient,
    directory: string,
    id: string,
    scope: MarketplaceScope,
    enabled: boolean,
  ): Promise<MarketplaceRemoveResult> {
    const file = await this.configFile(client, directory, scope)
    await setMcpEnabled(file, id, enabled)
    await reloadConfig(client, directory, scope)
    return { success: true, id, scope }
  }

  async updateConfig(
    client: OpencodeClient,
    directory: string,
    id: string,
    scope: MarketplaceScope,
    rawConfig: McpServerConfig,
  ): Promise<MarketplaceRemoveResult> {
    const config = sanitizeManualConfig(rawConfig)
    if (!config) {
      return { success: false, id, scope, error: "Invalid MCP server configuration." }
    }
    const file = await this.configFile(client, directory, scope)
    await writeMcpToFile(file, id, config, false, true)
    await reloadConfig(client, directory, scope)
    return { success: true, id, scope }
  }

  async install(
    client: OpencodeClient,
    directory: string,
    item: MarketplaceMcpItem,
    options: MarketplaceInstallOptions,
  ): Promise<MarketplaceInstallResult> {
    const transport = options.transport ?? (item.packages.length > 0 ? "package" : "remote")
    const config = transport === "remote"
      ? remotePackageConfig(item, options.headers, options.variables)
      : localPackageConfig(item, options.environment, options.variables)
    if (!config) {
      return {
        success: false,
        id: item.id,
        scope: options.scope,
        error:
          transport === "remote"
            ? "This MCP server does not provide a remote endpoint."
            : "This MCP server does not provide an automatically installable local package.",
      }
    }
    const missing = [
      ...(transport === "package"
        ? requiredEnvironmentVariables(item).filter((env) => !options.environment?.[env.name]?.trim())
        : []),
      // {{TOKEN}} substitutions apply to both package args and remote urls.
      ...requiredVariables(item).filter((entry) => !options.variables?.[entry.name]?.trim()),
    ]
    if (missing.length > 0) {
      return { success: false, id: item.id, scope: options.scope, error: `Missing required values: ${missing.map((entry) => entry.name).join(", ")}` }
    }

    const id = normalizeMcpID(item.name)
    const file = await this.configFile(client, directory, options.scope)
    await writeMcpToFile(file, id, config, false)
    await reloadConfig(client, directory, options.scope)
    return { success: true, id, scope: options.scope }
  }

  async installManual(
    client: OpencodeClient,
    directory: string,
    request: MarketplaceManualInstall,
  ): Promise<MarketplaceInstallResult> {
    const id = normalizeMcpID(request.id)
    const config = sanitizeManualConfig(request.config)
    if (!config) {
      return { success: false, id, scope: request.scope, error: "Invalid MCP server configuration." }
    }
    const file = await this.configFile(client, directory, request.scope)
    await writeMcpToFile(file, id, config, false)
    await reloadConfig(client, directory, request.scope)
    return { success: true, id, scope: request.scope }
  }

  async remove(
    client: OpencodeClient,
    directory: string,
    item: MarketplaceMcpItem,
    scope: MarketplaceScope,
  ): Promise<MarketplaceRemoveResult> {
    const id = normalizeMcpID(item.name)
    const file = await this.configFile(client, directory, scope)
    await writeMcpToFile(file, id, undefined, true)
    await reloadConfig(client, directory, scope)
    return { success: true, id, scope }
  }

  async removeById(
    client: OpencodeClient,
    directory: string,
    id: string,
    scope: MarketplaceScope,
  ): Promise<MarketplaceRemoveResult> {
    const file = await this.configFile(client, directory, scope)
    await writeMcpToFile(file, id, undefined, true)
    await reloadConfig(client, directory, scope)
    return { success: true, id, scope }
  }

  private async configFile(client: OpencodeClient, directory: string, scope: MarketplaceScope) {
    if (scope === "project") return await pickConfigFile(directory, PROJECT_CONFIG_FILES, "opencode.json")
    return await this.globalConfigFile(client, directory)
  }

  private async globalConfigFile(client: OpencodeClient, directory: string) {
    const response = await client.path.get({ directory }, { throwOnError: true })
    if (!response.data?.config) throw new Error("Unable to resolve Raccoon config directory")
    return await pickConfigFile(response.data.config, GLOBAL_CONFIG_FILES, "opencode.json")
  }
}

async function pickConfigFile(dir: string, candidates: string[], fallback: string) {
  for (const candidate of candidates) {
    const file = join(dir, candidate)
    try {
      await access(file)
      return file
    } catch {
      // Try the next candidate.
    }
  }
  return join(dir, fallback)
}

async function writeMcpToFile(
  file: string,
  id: string,
  value: McpConfig | undefined,
  allowMissing: boolean,
  allowOverwrite = false,
) {
  const raw = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (!raw && value === undefined && allowMissing) return false
  const source = raw?.trim() ? raw : "{}"
  const config = parseConfig(source, file)
  const current = config.mcp
  const exists =
    current && typeof current === "object" && !Array.isArray(current)
      ? Object.hasOwn(current as Record<string, unknown>, id)
      : false
  if (value !== undefined && exists && !allowOverwrite) throw new Error(`MCP server "${id}" is already installed`)
  if (value === undefined && !exists && allowMissing) return false
  const updated = applyEdits(
    source,
    modify(source, ["mcp", id], value, {
      formattingOptions: {
        insertSpaces: true,
        tabSize: 2,
      },
    }),
  )
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, updated.endsWith("\n") ? updated : `${updated}\n`)
  return true
}

async function readMcpIDs(file: string) {
  const raw = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "{}"
    throw error
  })
  const config = parseConfig(raw, file)
  if (!config.mcp || typeof config.mcp !== "object" || Array.isArray(config.mcp)) return []
  return Object.keys(config.mcp)
}

async function readMcpEntries(file: string): Promise<Array<{ id: string; config: McpServerConfig }>> {
  const raw = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "{}"
    throw error
  })
  const config = parseConfig(raw, file)
  if (!config.mcp || typeof config.mcp !== "object" || Array.isArray(config.mcp)) return []
  const entries: Array<{ id: string; config: McpServerConfig }> = []
  for (const [id, value] of Object.entries(config.mcp as Record<string, unknown>)) {
    const parsed = toServerConfig(value)
    if (parsed) entries.push({ id, config: parsed })
  }
  return entries
}

async function setMcpEnabled(file: string, id: string, enabled: boolean) {
  const raw = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  const source = raw?.trim() ? raw : "{}"
  const updated = applyEdits(
    source,
    modify(source, ["mcp", id, "enabled"], enabled, {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    }),
  )
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, updated.endsWith("\n") ? updated : `${updated}\n`)
}

function toServerConfig(value: unknown): McpServerConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const type = typeof record.type === "string" ? record.type.toLowerCase() : undefined
  if (type === "remote") {
    const url = typeof record.url === "string" ? record.url : ""
    return {
      type: "remote",
      url,
      ...(isStringRecord(record.headers) ? { headers: record.headers } : {}),
      ...(typeof record.enabled === "boolean" ? { enabled: record.enabled } : {}),
      ...(typeof record.timeout === "number" ? { timeout: record.timeout } : {}),
    }
  }
  const command = Array.isArray(record.command)
    ? record.command.filter((part): part is string => typeof part === "string")
    : []
  return {
    type: "local",
    command,
    ...(typeof record.cwd === "string" ? { cwd: record.cwd } : {}),
    ...(isStringRecord(record.environment) ? { environment: record.environment } : {}),
    ...(typeof record.enabled === "boolean" ? { enabled: record.enabled } : {}),
    ...(typeof record.timeout === "number" ? { timeout: record.timeout } : {}),
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return Object.values(value as Record<string, unknown>).every((entry) => typeof entry === "string")
}

function parseConfig(raw: string, file: string) {
  const errors: ParseError[] = []
  const parsed = parse(raw, errors, { allowTrailingComma: true })
  if (errors.length > 0) throw new Error(`Failed to parse config file ${file}`)
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  return {}
}

function cleanRecord(record: Record<string, string>) {
  return Object.fromEntries(Object.entries(record).filter((entry) => entry[0].trim() && entry[1].trim()))
}

function localPackageConfig(
  item: MarketplaceMcpItem,
  environment: Record<string, string> | undefined,
  variables: Record<string, string> | undefined,
): McpConfig | undefined {
  const pkg = item.packages.find((entry) => entry.registryType.toLowerCase() === "npm" && entry.transport?.type === "stdio")
    ?? item.packages.find((entry) => entry.registryType.toLowerCase() === "pypi" && entry.transport?.type === "stdio" && entry.runtimeHint === "uvx")
  if (!pkg) return undefined
  const command = pkg.runtimeArguments?.length
    ? applyArgTemplate(pkg.runtimeArguments, variables ?? {}, item.variables)
    : pkg.registryType.toLowerCase() === "npm"
      ? ["npx", "-y", packageSpecifier(pkg.identifier, pkg.version)]
      : ["uvx", pythonSpecifier(pkg.identifier, pkg.version)]
  const clean = cleanRecord(environment ?? {})
  return {
    type: "local",
    command,
    ...(Object.keys(clean).length > 0 ? { environment: clean } : {}),
  }
}

function remotePackageConfig(
  item: MarketplaceMcpItem,
  headers: Record<string, string> | undefined,
  variables: Record<string, string> | undefined,
): McpConfig | undefined {
  const remote = item.remotes[0]
  if (!remote?.url) return undefined
  const clean = cleanRecord(headers ?? {})
  return {
    type: "remote",
    url: substituteTokens(remote.url, variables ?? {}),
    ...(Object.keys(clean).length > 0 ? { headers: clean } : {}),
  }
}

// Replace every {{TOKEN}} in a string with its value (empty string when unset).
function substituteTokens(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key: string) => variables[key] ?? "")
}

// Substitute {{TOKEN}} placeholders across a command template. An arg that is exactly
// a single optional placeholder with no value is dropped, along with a preceding flag arg.
function applyArgTemplate(
  args: string[],
  variables: Record<string, string>,
  declared: MarketplaceMcpItem["variables"],
): string[] {
  const optional = new Set(declared.filter((entry) => !(entry.isRequired || entry.isSecret)).map((entry) => entry.name))
  const result: string[] = []
  for (const arg of args) {
    const soleToken = arg.match(/^\{\{\s*([^}]+?)\s*\}\}$/)
    const key = soleToken?.[1]
    if (key) {
      const value = variables[key]?.trim()
      if (!value && optional.has(key)) {
        // Drop an immediately preceding flag (e.g. `--read-only` for an empty `{{X}}`).
        const last = result[result.length - 1]
        if (last !== undefined && last.startsWith("-")) result.pop()
        continue
      }
    }
    result.push(substituteTokens(arg, variables))
  }
  return result
}

function sanitizeManualConfig(config: McpServerConfig): McpConfig | undefined {
  if (config.type === "local") {
    const command = Array.isArray(config.command) ? config.command.map((part) => `${part}`).filter((part) => part.length > 0) : []
    if (command.length === 0) return undefined
    const environment = cleanRecord(config.environment ?? {})
    return {
      type: "local",
      command,
      ...(config.cwd?.trim() ? { cwd: config.cwd.trim() } : {}),
      ...(Object.keys(environment).length > 0 ? { environment } : {}),
      ...(config.enabled === false ? { enabled: false } : {}),
      ...(typeof config.timeout === "number" ? { timeout: config.timeout } : {}),
    }
  }
  if (config.type === "remote") {
    const url = config.url?.trim()
    if (!url) return undefined
    const headers = cleanRecord(config.headers ?? {})
    return {
      type: "remote",
      url,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(config.enabled === false ? { enabled: false } : {}),
      ...(typeof config.timeout === "number" ? { timeout: config.timeout } : {}),
    }
  }
  return undefined
}

function packageSpecifier(identifier: string, version: string | undefined) {
  if (!version) return identifier
  return `${identifier}@${version}`
}

function pythonSpecifier(identifier: string, version: string | undefined) {
  if (!version) return identifier
  return `${identifier}==${version}`
}

function requiredEnvironmentVariables(item: MarketplaceMcpItem) {
  const seen = new Set<string>()
  return item.environmentVariables.filter((env) => {
    if (!env.name || seen.has(env.name)) return false
    seen.add(env.name)
    return env.isRequired || env.isSecret
  })
}

function requiredVariables(item: MarketplaceMcpItem) {
  const seen = new Set<string>()
  return item.variables.filter((entry) => {
    if (!entry.name || seen.has(entry.name)) return false
    seen.add(entry.name)
    return entry.isRequired || entry.isSecret
  })
}

async function reloadConfig(client: OpencodeClient, directory: string, scope: MarketplaceScope) {
  if (scope === "user") {
    await client.global.dispose({ throwOnError: true }).catch(() => undefined)
  }
  await client.instance.dispose({ directory }, { throwOnError: true }).catch(() => undefined)
}

export function normalizeMcpID(name: string) {
  const normalized = name
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || "mcp-server"
}
