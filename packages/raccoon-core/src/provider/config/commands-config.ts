import * as fs from "node:fs/promises"
import * as nodePath from "node:path"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import type { RaccoonAgentScope, RaccoonManagedCommand, RaccoonManagedCommandInput, WebviewToExtension } from "@opencode-ai/raccoon-webview"
import { pickProjectConfigDirName } from "./config-paths.js"

const COMMAND_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

type CommandsContext = {
  scope: RaccoonAgentScope
  dir: string
}

function requireCommandName(name: string) {
  const trimmed = name.trim()
  if (!COMMAND_NAME_RE.test(trimmed)) throw new Error("Command name must use letters, numbers, dashes, or underscores")
  return trimmed
}

export async function commandsContext(
  client: OpencodeClient,
  directory: string,
  scope: RaccoonAgentScope,
): Promise<CommandsContext | undefined> {
  if (scope === "user") {
    const pathInfo = await client.path.get({ directory }, { throwOnError: true })
    const configDir = pathInfo.data?.config
    if (!configDir) return undefined
    return { scope, dir: nodePath.join(configDir, "commands") }
  }
  return { scope, dir: nodePath.join(directory, await pickProjectConfigDirName(directory), "commands") }
}

export async function collectCommands(
  client: OpencodeClient,
  directory: string,
  scope: RaccoonAgentScope,
): Promise<RaccoonManagedCommand[]> {
  const ctx = await commandsContext(client, directory, scope)
  if (!ctx) return []
  return (await collectMarkdownFiles(ctx.dir))
    .map((file) => {
      const name = nodePath.relative(ctx.dir, file.path).replace(/\\/g, "/").replace(/\.md$/, "")
      return { ...parseCommandMarkdown(file.content), name, scope }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

type RaccoonCommandsConfigDeps = {
  client: () => Promise<OpencodeClient>
  directory: () => string
  refresh: () => Promise<void>
}

export class RaccoonCommandsConfig {
  constructor(private readonly deps: RaccoonCommandsConfigDeps) {}

  async saveCommand(message: Extract<WebviewToExtension, { type: "saveCommand" }>) {
    const scope = message.scope
    const name = requireCommandName(message.command.name)
    const original = message.originalName ? requireCommandName(message.originalName) : ""
    const ctx = await commandsContext(await this.deps.client(), this.deps.directory(), scope)
    if (!ctx) return
    await fs.mkdir(ctx.dir, { recursive: true })
    const target = nodePath.join(ctx.dir, `${name}.md`)
    if (original && original !== name) {
      await fs.rename(nodePath.join(ctx.dir, `${original}.md`), target).catch((err) => {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
      })
    }
    await fs.writeFile(target, formatCommandMarkdown({ ...message.command, name }))
    await this.flush(scope)
  }

  async deleteCommand(scope: RaccoonAgentScope, name: string) {
    const safe = requireCommandName(name)
    const ctx = await commandsContext(await this.deps.client(), this.deps.directory(), scope)
    if (!ctx) return
    await fs.unlink(nodePath.join(ctx.dir, `${safe}.md`)).catch((err) => {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    })
    await this.flush(scope)
  }

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

async function collectMarkdownFiles(dir: string): Promise<Array<{ path: string; content: string }>> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch((err) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return []
    throw err
  })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = nodePath.join(dir, entry.name)
      if (entry.isDirectory()) return collectMarkdownFiles(entryPath)
      if (!entry.isFile() || !entry.name.endsWith(".md")) return []
      return [{ path: entryPath, content: await fs.readFile(entryPath, "utf8").catch(() => "") }]
    }),
  )
  return nested.flat()
}

function parseCommandMarkdown(content: string): Omit<RaccoonManagedCommand, "name" | "scope"> {
  const parsed = parseFrontmatter(content)
  return {
    description: stringValue(parsed.data.description),
    agent: stringValue(parsed.data.agent),
    model: stringValue(parsed.data.model),
    subtask: parsed.data.subtask === true,
    template: parsed.body.trim(),
  }
}

function parseFrontmatter(content: string) {
  const normalized = content.replace(/\r\n/g, "\n")
  if (!normalized.startsWith("---\n")) return { data: {} as Record<string, unknown>, body: content }
  const end = normalized.indexOf("\n---\n", 4)
  if (end < 0) return { data: {} as Record<string, unknown>, body: content }
  const data = Object.fromEntries(
    normalized
      .slice(4, end)
      .split("\n")
      .map((line) => {
        const separator = line.indexOf(":")
        if (separator < 0) return undefined
        const key = line.slice(0, separator).trim()
        if (!key) return undefined
        return [key, parseScalar(line.slice(separator + 1).trim())] as const
      })
      .filter((entry): entry is readonly [string, unknown] => !!entry),
  )
  return { data, body: normalized.slice(end + 5) }
}

function parseScalar(value: string): unknown {
  if (value === "true") return true
  if (value === "false") return false
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value)
    } catch {
      return value.slice(1, -1)
    }
  }
  return value
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function formatCommandMarkdown(command: RaccoonManagedCommandInput) {
  const frontmatter = [
    ["description", command.description?.trim()],
    ["agent", command.agent?.trim()],
    ["model", command.model?.trim()],
    ["subtask", command.subtask ? "true" : undefined],
  ]
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .map(([key, value]) => `${key}: ${value === "true" ? value : JSON.stringify(value)}`)
  const template = command.template.trim()
  if (frontmatter.length === 0) return `${template}\n`
  return `---\n${frontmatter.join("\n")}\n---\n${template}\n`
}
