import type { MarketplaceMcpItem } from "./types.js"
import { buildCatalogFromYaml } from "./transform.js"

// The MCP catalog is served entirely from the raccoon-marketplace repo and fetched at
// runtime — there is no bundled data. `REMOTE_CATALOG_URL` points at the raw YAML.
const REMOTE_CATALOG_URL =
  "https://raw.githubusercontent.com/chenjianx/raccoon-marketplace/main/mcps/marketplace.yaml"

const FETCH_TIMEOUT_MS = 15_000

export type LoadCatalogResult = {
  items: MarketplaceMcpItem[]
  errors?: string[]
}

// Fetch and parse the remote marketplace catalog. On any network/parse failure this
// returns an empty catalog with an error string so the caller can surface it.
export async function loadCatalog(): Promise<LoadCatalogResult> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let yamlText: string
    try {
      const response = await fetch(REMOTE_CATALOG_URL, { signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
      yamlText = await response.text()
    } finally {
      clearTimeout(timer)
    }
    return { items: buildCatalogFromYaml(yamlText) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      items: [],
      errors: [`Failed to load MCP marketplace from ${REMOTE_CATALOG_URL}: ${message}`],
    }
  }
}
