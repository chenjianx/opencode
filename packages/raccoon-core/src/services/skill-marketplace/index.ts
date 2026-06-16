import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import { SKILL_MARKETPLACE_SOURCES } from "./catalog.js"
import { SkillMarketplaceInstaller } from "./installer.js"
import { scanSkillSource } from "./scanner.js"
import type {
  SkillMarketplaceDataResponse,
  SkillMarketplaceInstallOptions,
  SkillMarketplaceInstallResult,
  SkillMarketplaceInstalledSkill,
  SkillMarketplaceItem,
  SkillMarketplaceRemoveResult,
  SkillMarketplaceScope,
} from "./types.js"

export class SkillMarketplaceService {
  private readonly installer = new SkillMarketplaceInstaller()

  // `notify` surfaces a success toast; supplied by the host so this service touches no editor API.
  constructor(private readonly notify: (message: string) => void = () => {}) {}

  async fetchData(client: OpencodeClient, directory: string): Promise<SkillMarketplaceDataResponse> {
    const scanned = await Promise.all(SKILL_MARKETPLACE_SOURCES.map((source) => scanSkillSource(source)))
    return {
      sources: SKILL_MARKETPLACE_SOURCES,
      items: scanned.flatMap((result) => result.items),
      installed: await this.installer.detect(client, directory),
      errors: scanned.flatMap((result) => result.errors ?? []),
    }
  }

  async install(
    client: OpencodeClient,
    directory: string,
    item: SkillMarketplaceItem,
    options: SkillMarketplaceInstallOptions,
  ): Promise<SkillMarketplaceInstallResult> {
    const result = await this.installer.install(client, directory, item, options)
    if (result.success) this.notify(`Installed skill ${item.name}`)
    return result
  }

  async remove(
    client: OpencodeClient,
    directory: string,
    item: SkillMarketplaceItem,
    scope: SkillMarketplaceScope,
  ): Promise<SkillMarketplaceRemoveResult> {
    const result = await this.installer.remove(client, directory, item, scope)
    if (result.success) this.notify(`Removed skill ${item.name}`)
    return result
  }

  async listInstalled(client: OpencodeClient, directory: string): Promise<SkillMarketplaceInstalledSkill[]> {
    return await this.installer.listInstalled(client, directory)
  }
}

export type {
  SkillMarketplaceDataResponse,
  SkillMarketplaceInstallOptions,
  SkillMarketplaceInstallResult,
  SkillMarketplaceInstalledMetadata,
  SkillMarketplaceInstalledSkill,
  SkillMarketplaceItem,
  SkillMarketplaceRemoveResult,
  SkillMarketplaceScope,
  SkillMarketplaceSource,
} from "./types.js"
