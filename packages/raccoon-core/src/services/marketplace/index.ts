import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import { MARKETPLACE_CATALOG } from "./catalog.js"
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

  // `notify` surfaces a success toast; the host supplies it (no-op by default) so this service
  // stays free of any editor API.
  constructor(private readonly notify: (message: string) => void = () => {}) {}

  async fetchData(client: OpencodeClient, directory: string): Promise<MarketplaceDataResponse> {
    const installed = await this.installer.detect(client, directory)
    return { items: MARKETPLACE_CATALOG, installed }
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
    // No resources to release; the catalog is static.
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
