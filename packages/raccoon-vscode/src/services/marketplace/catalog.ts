import type { MarketplaceMcpItem } from "./types.js"
import generated from "./catalog.data.json" with { type: "json" }

// Built-in catalog of the official reference MCP servers from modelcontextprotocol/servers.
// Every entry is a local stdio package installable via npx/uvx — no network lookup, no env required.
const REPO = "https://github.com/modelcontextprotocol/servers/tree/main/src"

function npm(identifier: string): MarketplaceMcpItem["packages"] {
  return [{ registryType: "npm", identifier, transport: { type: "stdio" } }]
}

function pypi(identifier: string): MarketplaceMcpItem["packages"] {
  return [{ registryType: "pypi", identifier, runtimeHint: "uvx", transport: { type: "stdio" } }]
}

function entry(
  id: string,
  title: string,
  description: string,
  packages: MarketplaceMcpItem["packages"],
  repoPath: string,
): MarketplaceMcpItem {
  return {
    id,
    name: id,
    title,
    description,
    version: "",
    repositoryUrl: `${REPO}/${repoPath}`,
    remotes: [],
    packages,
    headers: [],
    environmentVariables: [],
    variables: [],
    transportTypes: ["package"],
  }
}

export const MARKETPLACE_CATALOG: MarketplaceMcpItem[] = dedupeById([
  entry(
    "filesystem",
    "Filesystem",
    "Secure file operations with configurable access controls. After installing, add an allowed directory path to the command in opencode.json.",
    npm("@modelcontextprotocol/server-filesystem"),
    "filesystem",
  ),
  entry(
    "fetch",
    "Fetch",
    "Web content fetching and conversion for efficient LLM usage.",
    pypi("mcp-server-fetch"),
    "fetch",
  ),
  entry(
    "git",
    "Git",
    "Tools to read, search, and manipulate Git repositories.",
    pypi("mcp-server-git"),
    "git",
  ),
  entry(
    "memory",
    "Memory",
    "Knowledge graph-based persistent memory system.",
    npm("@modelcontextprotocol/server-memory"),
    "memory",
  ),
  entry(
    "sequential-thinking",
    "Sequential Thinking",
    "Dynamic and reflective problem-solving through thought sequences.",
    npm("@modelcontextprotocol/server-sequential-thinking"),
    "sequentialthinking",
  ),
  entry(
    "time",
    "Time",
    "Time and timezone conversion capabilities.",
    pypi("mcp-server-time"),
    "time",
  ),
  entry(
    "everything",
    "Everything",
    "Reference / test server with prompts, resources, and tools.",
    npm("@modelcontextprotocol/server-everything"),
    "everything",
  ),
  // Curated servers generated from the Kilo marketplace (scripts/build-mcp-catalog.mjs).
  ...(generated as MarketplaceMcpItem[]),
])

// Keep the first occurrence of each id so the hand-written reference entries above
// win over any same-id entry in the generated catalog.
function dedupeById(items: MarketplaceMcpItem[]): MarketplaceMcpItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}
