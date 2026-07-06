import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as nodePath from "node:path"
import { applyEdits, modify, parse as parseJsonc, type ParseError } from "jsonc-parser/lib/esm/main.js"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import type { RaccoonAgentScope, RaccoonRule, WebviewToExtension } from "@opencode-ai/raccoon-webview"
import { GLOBAL_CONFIG_FILES, PROJECT_CONFIG_FILES, pickConfigFile, pickProjectConfigDirName } from "./config-paths.js"

const RULE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

// A rule lives as a markdown file under `<scope>/rules/`. Whether it is
// "enabled" is determined purely by whether its path appears in the
// `instructions` array of the scope's opencode.json — disabling removes the
// array entry but keeps the file on disk. This reuses opencode's existing
// instruction loader with zero core changes.
type RulesContext = {
  scope: RaccoonAgentScope
  dir: string // absolute rules directory
  configFile: string // absolute opencode.json / .jsonc
  entryFor: (name: string) => string // instructions entry string for a rule
  globEntries: string[] // glob forms that would cover the whole dir
}

function requireRuleName(name: string): string {
  const trimmed = (name ?? "").trim()
  if (!RULE_NAME_RE.test(trimmed)) throw new Error(`Invalid rule name: ${name}`)
  return trimmed
}

function parseConfig(raw: string, file: string): Record<string, unknown> {
  const errors: ParseError[] = []
  const parsed = parseJsonc(raw, errors, { allowTrailingComma: true })
  if (errors.length > 0) throw new Error(`Failed to parse config file ${file}`)
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  return {}
}

function normalizeEntry(entry: string): string {
  let value = entry.trim().replace(/\\/g, "/")
  while (value.startsWith("./")) value = value.slice(2)
  return value
}

function toTildePath(abs: string): string {
  const posix = abs.replace(/\\/g, "/")
  const home = os.homedir().replace(/\\/g, "/")
  if (posix === home) return "~"
  if (posix.startsWith(`${home}/`)) return `~/${posix.slice(home.length + 1)}`
  return posix
}

async function readInstructions(file: string): Promise<string[]> {
  let raw: string
  try {
    raw = await fs.readFile(file, "utf8")
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return []
    throw err
  }
  const config = parseConfig(raw.trim() ? raw : "{}", file)
  const value = config.instructions
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

export async function rulesContext(
  client: OpencodeClient,
  directory: string,
  scope: RaccoonAgentScope,
): Promise<RulesContext | undefined> {
  if (scope === "user") {
    const pathInfo = await client.path.get({ directory }, { throwOnError: true })
    const configDir = pathInfo.data?.config
    if (!configDir) return undefined
    const dir = nodePath.join(configDir, "rules")
    const base = toTildePath(dir)
    return {
      scope,
      dir,
      configFile: await pickConfigFile(configDir, GLOBAL_CONFIG_FILES),
      entryFor: (name) => `${base}/${name}.md`,
      globEntries: [`${base}/*.md`, `${base}/**/*.md`],
    }
  }
  const dirName = await pickProjectConfigDirName(directory)
  const dir = nodePath.join(directory, dirName, "rules")
  return {
    scope,
    dir,
    configFile: await pickConfigFile(directory, PROJECT_CONFIG_FILES),
    entryFor: (name) => `${dirName}/rules/${name}.md`,
    globEntries: [`${dirName}/rules/*.md`, `${dirName}/rules/**/*.md`],
  }
}

export async function collectRules(
  client: OpencodeClient,
  directory: string,
  scope: RaccoonAgentScope,
): Promise<RaccoonRule[]> {
  const ctx = await rulesContext(client, directory, scope)
  if (!ctx) return []
  let dirEntries: { name: string; isFile: () => boolean }[]
  try {
    dirEntries = await fs.readdir(ctx.dir, { withFileTypes: true })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return []
    throw err
  }
  const instructions = new Set((await readInstructions(ctx.configFile)).map(normalizeEntry))
  const globActive = ctx.globEntries.some((glob) => instructions.has(normalizeEntry(glob)))
  const files = dirEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
  const rules: RaccoonRule[] = []
  for (const file of files) {
    const name = file.slice(0, -3)
    const content = await fs.readFile(nodePath.join(ctx.dir, file), "utf8").catch(() => "")
    rules.push({
      name,
      scope,
      enabled: globActive || instructions.has(normalizeEntry(ctx.entryFor(name))),
      content,
    })
  }
  return rules
}

type RaccoonRulesConfigDeps = {
  client: () => Promise<OpencodeClient>
  directory: () => string
  refresh: () => Promise<void>
}

export class RaccoonRulesConfig {
  constructor(private readonly deps: RaccoonRulesConfigDeps) {}

  async collect(scope: RaccoonAgentScope) {
    return collectRules(await this.deps.client(), this.deps.directory(), scope)
  }

  async saveRule(message: Extract<WebviewToExtension, { type: "saveRule" }>) {
    const scope = message.scope
    const name = requireRuleName(message.name)
    const original = message.originalName ? requireRuleName(message.originalName) : ""
    const ctx = await rulesContext(await this.deps.client(), this.deps.directory(), scope)
    if (!ctx) return
    await fs.mkdir(ctx.dir, { recursive: true })
    const target = nodePath.join(ctx.dir, `${name}.md`)

    if (original && original !== name) {
      // Rename: move the file and carry the enabled state across to the new name.
      const wasEnabled = (await readInstructions(ctx.configFile)).some(
        (entry) => normalizeEntry(entry) === normalizeEntry(ctx.entryFor(original)),
      )
      await fs.rename(nodePath.join(ctx.dir, `${original}.md`), target).catch((err) => {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
      })
      await this.setInstructionEntry(ctx, original, false)
      await fs.writeFile(target, message.content)
      if (wasEnabled) await this.setInstructionEntry(ctx, name, true)
    } else {
      const existed = await fs.access(target).then(
        () => true,
        () => false,
      )
      await fs.writeFile(target, message.content)
      // A brand-new rule is enabled by default; editing an existing rule's body
      // must not change its enabled state (that is toggled separately).
      if (!existed) await this.setInstructionEntry(ctx, name, true)
    }
    await this.flush(scope)
  }

  async toggleRule(scope: RaccoonAgentScope, name: string, enabled: boolean) {
    const ctx = await rulesContext(await this.deps.client(), this.deps.directory(), scope)
    if (!ctx) return
    await this.setInstructionEntry(ctx, requireRuleName(name), enabled)
    await this.flush(scope)
  }

  async deleteRule(scope: RaccoonAgentScope, name: string) {
    const safe = requireRuleName(name)
    const ctx = await rulesContext(await this.deps.client(), this.deps.directory(), scope)
    if (!ctx) return
    await this.setInstructionEntry(ctx, safe, false)
    await fs.unlink(nodePath.join(ctx.dir, `${safe}.md`)).catch((err) => {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    })
    await this.flush(scope)
  }

  // Add or remove a single rule path in the scope's `instructions` array,
  // preserving comments/formatting via jsonc-parser edits.
  private async setInstructionEntry(ctx: RulesContext, name: string, present: boolean) {
    let raw = ""
    try {
      raw = await fs.readFile(ctx.configFile, "utf8")
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    }
    const source = raw.trim() ? raw : "{}"
    const config = parseConfig(source, ctx.configFile)
    const current = Array.isArray(config.instructions)
      ? config.instructions.filter((item): item is string => typeof item === "string")
      : []
    const entry = ctx.entryFor(name)
    const normalized = normalizeEntry(entry)
    const has = current.some((item) => normalizeEntry(item) === normalized)
    if (present === has) return
    const next = present ? [...current, entry] : current.filter((item) => normalizeEntry(item) !== normalized)
    const updated = applyEdits(
      source,
      modify(source, ["instructions"], next, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
    )
    await fs.mkdir(nodePath.dirname(ctx.configFile), { recursive: true })
    await fs.writeFile(ctx.configFile, updated.endsWith("\n") ? updated : `${updated}\n`)
  }

  // opencode caches config per instance; dispose so the next refresh re-reads
  // the just-written instructions. Mirrors RaccoonProviderConfig.reloadInstanceConfig.
  private async flush(scope: RaccoonAgentScope) {
    try {
      const client = await this.deps.client()
      if (scope === "user") await client.global.dispose({ throwOnError: true })
      await client.instance.dispose({ directory: this.deps.directory() })
    } catch {
      // Best-effort: the files are already written; a stale view recovers on next reload.
    }
    await this.deps.refresh()
  }
}
