import yaml from "js-yaml"
import type { MarketplaceMcpItem, RegistryEnvironmentVariable, RegistryPackage, RegistryVariable } from "./types.js"

// Transform a raccoon-marketplace `mcps/marketplace.yaml` document into the
// MarketplaceMcpItem[] the webview consumes. This is the runtime port of the old
// build-time scripts/build-mcp-catalog.mjs — same rules, applied to fetched YAML.
//
// Only install methods the opencode installer can reconstruct are kept:
//   - `npx -y <pkg>`  -> npm stdio package
//   - `uvx <pkg>`     -> pypi stdio package (runtimeHint uvx)
//   - remote url (sse / http / streamable-http) -> remote endpoint
// Entries that only ship docker/node/python/binary commands are dropped, since
// the installer cannot synthesise those commands from a package identifier.

const REMOTE_TYPES = new Set(["sse", "http", "streamable-http", "streamable_http"])

type RawParameter = { key?: string; name?: string; placeholder?: string }
type RawMethod = { content?: unknown; parameters?: RawParameter[] }
type RawItem = {
  id?: unknown
  name?: unknown
  description?: unknown
  url?: unknown
  content?: RawMethod[] | string
  parameters?: RawParameter[]
}

function isSecretKey(key: string): boolean {
  return /TOKEN|KEY|SECRET|PASSWORD|PAT|CREDENTIAL|APIKEY/i.test(key)
}

// Parse the embedded JSON config string of one install method.
function parseContent(content: unknown): Record<string, unknown> | undefined {
  if (typeof content !== "string") return undefined
  try {
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    return undefined
  }
}

// Pull the npm package specifier out of an `npx` args array: the first
// positional after `-y`/`--yes`, falling back to the first non-flag arg.
function npmIdentifier(args: unknown): string | undefined {
  if (!Array.isArray(args)) return undefined
  const yesIndex = args.findIndex((arg) => arg === "-y" || arg === "--yes")
  if (yesIndex >= 0) {
    const next = args[yesIndex + 1]
    if (typeof next === "string" && !next.startsWith("-")) return next
  }
  return args.find((arg) => typeof arg === "string" && !arg.startsWith("-"))
}

// uvx flags that consume the following argument as their value.
const UVX_VALUE_FLAGS = new Set([
  "--from", "--with", "--with-editable", "--with-requirements", "--python", "-p",
  "--hash", "--index", "--index-url", "--extra-index-url", "--constraint", "--override",
])

// Pull the runnable package out of a `uvx` args array. uvx runs the FIRST
// positional that isn't consumed by a uvx option (e.g. in
// `--from pkg==1.2 --hash <h> pkg --tool-tier core` the tool is `pkg`).
function pypiIdentifier(args: unknown): string | undefined {
  if (!Array.isArray(args)) return undefined
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (typeof arg !== "string") continue
    if (arg.startsWith("-")) {
      // `--flag=value` carries its own value; `--flag value` consumes the next arg.
      if (!arg.includes("=") && UVX_VALUE_FLAGS.has(arg)) index++
      continue
    }
    // A bare positional is the tool to run. If it carries a `==version`
    // pin (e.g. `composer-trade-mcp==0.1.4`), the identifier is the name part.
    return arg.includes("==") ? arg.split("==")[0] : arg
  }
  return undefined
}

// Collect {{PLACEHOLDER}} env keys from a method's env object.
function placeholderEnvKeys(env: unknown): string[] {
  if (!env || typeof env !== "object") return []
  return Object.entries(env as Record<string, unknown>)
    .filter(([, value]) => typeof value === "string" && /\{\{.*\}\}/.test(value))
    .map(([key]) => key)
}

// Collect {{TOKEN}} keys referenced inside a single string (arg or url).
function placeholderTokens(value: unknown): string[] {
  if (typeof value !== "string") return []
  const keys: string[] = []
  for (const match of value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
    if (match[1]) keys.push(match[1])
  }
  return keys
}

function buildItem(raw: RawItem): MarketplaceMcpItem | undefined {
  // `content` is either an array of install methods or, for single-method
  // servers, the embedded JSON string directly.
  const methods: RawMethod[] = Array.isArray(raw.content)
    ? raw.content
    : typeof raw.content === "string"
      ? [{ content: raw.content }]
      : []
  const packages: RegistryPackage[] = []
  const seenPackages = new Set<string>()
  const remotes: MarketplaceMcpItem["remotes"] = []
  const seenRemotes = new Set<string>()
  const envKeys = new Set<string>()
  // {{TOKEN}} placeholders found in command args / remote urls (textual substitution).
  const varKeys = new Set<string>()

  // Index parameters (top-level + per-method) by key for placeholder/description.
  const params = new Map<string, RawParameter>()
  const collectParams = (list: RawParameter[] | undefined) => {
    if (!Array.isArray(list)) return
    for (const param of list) {
      if (param && typeof param.key === "string" && !params.has(param.key)) params.set(param.key, param)
    }
  }
  collectParams(raw.parameters)

  for (const method of methods) {
    collectParams(method?.parameters)
    const config = parseContent(method?.content)
    if (!config) continue

    if (REMOTE_TYPES.has(String(config.type)) && typeof config.url === "string") {
      if (!seenRemotes.has(config.url)) {
        seenRemotes.add(config.url)
        remotes.push({ type: "streamable-http", url: config.url })
        for (const key of placeholderTokens(config.url)) varKeys.add(key)
      }
      for (const key of placeholderEnvKeys(config.env)) envKeys.add(key)
      continue
    }

    if (config.command === "npx") {
      const identifier = npmIdentifier(config.args)
      // @smithery/cli is an installer wrapper (`npx @smithery/cli install <pkg>`),
      // not a runnable stdio server — skip it.
      if (identifier && identifier !== "@smithery/cli" && !seenPackages.has(`npm:${identifier}`)) {
        seenPackages.add(`npm:${identifier}`)
        // Preserve the full command (executable + args) so {{TOKEN}} placeholders survive.
        const runtimeArguments = ["npx", ...(Array.isArray(config.args) ? config.args : [])]
        packages.push({ registryType: "npm", identifier, transport: { type: "stdio" }, runtimeArguments })
        for (const arg of runtimeArguments) for (const key of placeholderTokens(arg)) varKeys.add(key)
      }
      for (const key of placeholderEnvKeys(config.env)) envKeys.add(key)
      continue
    }

    if (config.command === "uvx") {
      const identifier = pypiIdentifier(config.args)
      if (identifier && !seenPackages.has(`pypi:${identifier}`)) {
        seenPackages.add(`pypi:${identifier}`)
        const runtimeArguments = ["uvx", ...(Array.isArray(config.args) ? config.args : [])]
        packages.push({ registryType: "pypi", identifier, runtimeHint: "uvx", transport: { type: "stdio" }, runtimeArguments })
        for (const arg of runtimeArguments) for (const key of placeholderTokens(arg)) varKeys.add(key)
      }
      for (const key of placeholderEnvKeys(config.env)) envKeys.add(key)
      continue
    }
    // docker / node / python / binary commands are not reconstructable -> skip.
  }

  // Drop entries with no installable method.
  if (packages.length === 0 && remotes.length === 0) return undefined

  const toRegistryEntry = (name: string): RegistryEnvironmentVariable & RegistryVariable => {
    const param = params.get(name)
    return {
      name,
      isRequired: true,
      isSecret: isSecretKey(name),
      ...(param?.placeholder ? { placeholder: String(param.placeholder) } : {}),
      ...(param?.name ? { description: String(param.name) } : {}),
    }
  }

  const environmentVariables = [...envKeys].map(toRegistryEntry)
  // Command/url placeholders that are not already injected as env vars. Env wins.
  const variables = [...varKeys].filter((name) => !envKeys.has(name)).map(toRegistryEntry)

  return {
    id: String(raw.id),
    name: String(raw.id),
    title: raw.name ? String(raw.name) : String(raw.id),
    description: raw.description ? String(raw.description).replace(/\s+/g, " ").trim() : "",
    version: "",
    ...(raw.url ? { repositoryUrl: String(raw.url) } : {}),
    remotes,
    packages,
    headers: [],
    environmentVariables,
    variables,
    transportTypes: [
      ...(packages.length > 0 ? (["package"] as const) : []),
      ...(remotes.length > 0 ? (["remote"] as const) : []),
    ],
  }
}

// Parse a marketplace.yaml document and build the sorted catalog of installable servers.
export function buildCatalogFromYaml(yamlText: string): MarketplaceMcpItem[] {
  const doc = yaml.load(yamlText) as { items?: RawItem[] } | undefined
  const items = Array.isArray(doc?.items) ? doc.items : []
  return items
    .map(buildItem)
    .filter((item): item is MarketplaceMcpItem => Boolean(item))
    .sort((a, b) => a.title!.localeCompare(b.title!))
}
