import { access } from "node:fs/promises"
import { join } from "node:path"

// raccoon 品牌配置文件/目录的统一解析助手。运行时（packages/opencode）已同时读取
// raccoon.*/opencode.* 与 .raccoon/.opencode，此处让写入侧优先落到 raccoon，仅在已存在
// 旧版 opencode 配置时才续写原处，避免把一个项目拆成两份配置。

export const PROJECT_CONFIG_FILES = ["raccoon.jsonc", "raccoon.json", "opencode.jsonc", "opencode.json"]
export const GLOBAL_CONFIG_FILES = ["raccoon.jsonc", "raccoon.json", "opencode.jsonc", "opencode.json", "config.json"]
export const DEFAULT_CONFIG_FILE = "raccoon.json"

export type ProjectConfigDirName = ".raccoon" | ".opencode"

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

// 返回第一个已存在的候选配置文件；都不存在则回退到 fallback（默认 raccoon.json）。
export async function pickConfigFile(
  dir: string,
  candidates: string[],
  fallback: string = DEFAULT_CONFIG_FILE,
): Promise<string> {
  for (const candidate of candidates) {
    const candidatePath = join(dir, candidate)
    if (await exists(candidatePath)) return candidatePath
  }
  return join(dir, fallback)
}

// 项目内配置目录名：优先已存在的 .raccoon，其次已存在的 .opencode，都没有则默认 .raccoon。
// 与 packages/opencode/src/plugin/install.ts 的 patchDir() 选择逻辑一致。
export async function pickProjectConfigDirName(directory: string): Promise<ProjectConfigDirName> {
  if (await exists(join(directory, ".raccoon"))) return ".raccoon"
  if (await exists(join(directory, ".opencode"))) return ".opencode"
  return ".raccoon"
}
