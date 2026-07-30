import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import { loadCatalog, type LoadCatalogResult } from "./catalog.js"
import { MarketplaceInstaller } from "./installer.js"
import type {
  MarketplaceDataResponse,
  MarketplaceInstalledServer,
  MarketplaceInstallOptions,
  MarketplaceInstallResult,
  MarketplaceManualInstall,
  MarketplaceMcpItem,
  MarketplaceRemoveResult,
  MarketplaceScope,
  McpServerConfig,
  McpStatus,
} from "./types.js"

export class MarketplaceService {
  private readonly installer = new MarketplaceInstaller()
  // Cached remote catalog. The marketplace YAML rarely changes within a session, so we
  // serve a successful fetch from cache for CATALOG_TTL_MS to avoid refetching on every open.
  private catalogCache?: { result: LoadCatalogResult; fetchedAt: number }
  private catalogInflight?: Promise<LoadCatalogResult>
  private static readonly CATALOG_TTL_MS = 5 * 60 * 1000

  // `notify` surfaces a success toast; the host supplies it (no-op by default) so this service
  // stays free of any editor API.
  constructor(private readonly notify: (message: string) => void = () => {}) {}

  // Load the catalog, serving a fresh successful fetch from cache. A cached result that only
  // carries the reference baseline (i.e. the remote fetch failed) is not cached, so the next
  // open retries the network.
  private async getCatalog(force?: boolean): Promise<LoadCatalogResult> {
    const now = Date.now()
    if (!force && this.catalogCache && now - this.catalogCache.fetchedAt < MarketplaceService.CATALOG_TTL_MS) {
      return this.catalogCache.result
    }
    if (!force && this.catalogInflight) return this.catalogInflight
    this.catalogInflight = loadCatalog()
      .then((result) => {
        // Only cache a full remote load; keep retrying while we're stuck on the baseline.
        if (!result.errors?.length) this.catalogCache = { result, fetchedAt: Date.now() }
        return result
      })
      .finally(() => {
        this.catalogInflight = undefined
      })
    return this.catalogInflight
  }

  async fetchData(client: OpencodeClient, directory: string, force?: boolean): Promise<MarketplaceDataResponse> {
    const [catalog, installed] = await Promise.all([
      this.getCatalog(force),
      this.installer.detect(client, directory),
    ])
    return { items: catalog.items, installed, errors: catalog.errors }
  }

  async install(
    client: OpencodeClient,
    directory: string,
    item: MarketplaceMcpItem,
    options: MarketplaceInstallOptions,
  ): Promise<MarketplaceInstallResult> {
    const result = await this.installer.install(client, directory, item, options)
    if (result.success) this.notify(`Installed MCP server ${item.title ?? item.name}`)
    return result
  }

  async installManual(
    client: OpencodeClient,
    directory: string,
    request: MarketplaceManualInstall,
  ): Promise<MarketplaceInstallResult> {
    const result = await this.installer.installManual(client, directory, request)
    if (result.success) this.notify(`Added MCP server ${result.id}`)
    return result
  }

  async remove(
    client: OpencodeClient,
    directory: string,
    item: MarketplaceMcpItem,
    scope: MarketplaceScope,
  ): Promise<MarketplaceRemoveResult> {
    const result = await this.installer.remove(client, directory, item, scope)
    if (result.success) this.notify(`Removed MCP server ${item.title ?? item.name}`)
    return result
  }

  async listInstalled(client: OpencodeClient, directory: string): Promise<MarketplaceInstalledServer[]> {
    return await this.installer.listInstalled(client, directory)
  }

  async status(client: OpencodeClient, directory: string): Promise<Record<string, McpStatus>> {
    const response = await client.mcp.status({ directory }, { throwOnError: true })
    return (response.data ?? {}) as Record<string, McpStatus>
  }

  async setEnabled(
    client: OpencodeClient,
    directory: string,
    id: string,
    scope: MarketplaceScope,
    enabled: boolean,
  ): Promise<MarketplaceRemoveResult> {
    return await this.installer.setEnabled(client, directory, id, scope, enabled)
  }

  async updateConfig(
    client: OpencodeClient,
    directory: string,
    id: string,
    scope: MarketplaceScope,
    config: McpServerConfig,
  ): Promise<MarketplaceRemoveResult> {
    const result = await this.installer.updateConfig(client, directory, id, scope, config)
    if (result.success) this.notify(`Updated MCP server ${id}`)
    return result
  }

  async connect(client: OpencodeClient, directory: string, id: string): Promise<void> {
    await client.mcp.connect({ name: id, directory }, { throwOnError: true })
  }

  async disconnect(client: OpencodeClient, directory: string, id: string): Promise<void> {
    await client.mcp.disconnect({ name: id, directory }, { throwOnError: true })
  }

  async removeById(
    client: OpencodeClient,
    directory: string,
    id: string,
    scope: MarketplaceScope,
  ): Promise<MarketplaceRemoveResult> {
    const result = await this.installer.removeById(client, directory, id, scope)
    if (result.success) this.notify(`Removed MCP server ${id}`)
    return result
  }

  dispose() {
    // No resources to release; the catalog cache is plain in-memory state.
  }
}

export type {
  MarketplaceDataResponse,
  MarketplaceInstalledMetadata,
  MarketplaceInstalledServer,
  MarketplaceInstallOptions,
  MarketplaceInstallResult,
  MarketplaceManualInstall,
  MarketplaceMcpItem,
  MarketplaceRemoveResult,
  MarketplaceScope,
  McpServerConfig,
  McpStatus,
} from "./types.js"
