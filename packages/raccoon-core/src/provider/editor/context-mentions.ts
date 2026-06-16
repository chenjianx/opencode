import { spawn } from "node:child_process"
import * as fs from "node:fs/promises"
import * as path from "node:path"

type Attachment = {
  path: string
  filename?: string
  mime?: string
  url: string
  source?: {
    type: "file"
    path: string
    text: {
      value: string
      start: number
      end: number
    }
  }
}

const LIMIT = 400_000
const SMALL = 80_000
const TIMEOUT = 15_000
const TERMINAL_OUTPUT_LINE_LIMIT = 500
const TERMINAL_OUTPUT_CHARACTER_LIMIT = 50_000
const TERMINAL_PATTERN = /(^|\s)@terminal(?=\s|$)/
const GIT_CHANGES_PATTERN = /(^|\s)@git-changes(?=\s|$)/

type Result = {
  out: string
  err: string
  code: number | null
  signal: NodeJS.Signals | null
  truncated: boolean
  error?: string
}

export function mentionSource(text: string, mention: string, filename: string) {
  const index = text.indexOf(`@${mention}`)
  if (index === -1) return undefined
  return {
    type: "file" as const,
    path: filename,
    text: {
      value: `@${mention}`,
      start: index,
      end: index + mention.length + 1,
    },
  }
}

export function attachment(filename: string, content: string, source: Attachment["source"]): Attachment {
  return {
    path: filename,
    filename,
    mime: "text/plain",
    url: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`,
    source,
  }
}

function hasTerminalMention(text: string) {
  return TERMINAL_PATTERN.test(text)
}

function hasGitChangesMention(text: string) {
  return GIT_CHANGES_PATTERN.test(text)
}

function trimPrompt(content: string) {
  const lines = content.split("\n")
  if (lines.length < 2) return content

  const last = lines.at(-1)?.trim()
  if (!last) return content

  let index = -1
  for (let i = lines.length - 2; i >= 0; i--) {
    if (lines[i]!.trim().startsWith(last)) {
      index = i
      break
    }
  }
  if (index === -1) return content
  return lines.slice(index).join("\n")
}

function truncateTerminalOutput(content: string) {
  if (TERMINAL_OUTPUT_CHARACTER_LIMIT > 0 && content.length > TERMINAL_OUTPUT_CHARACTER_LIMIT) {
    const before = Math.floor(TERMINAL_OUTPUT_CHARACTER_LIMIT * 0.2)
    const after = TERMINAL_OUTPUT_CHARACTER_LIMIT - before
    const omitted = content.length - TERMINAL_OUTPUT_CHARACTER_LIMIT
    return `${content.slice(0, before)}\n[...${omitted} characters omitted...]\n${content.slice(-after)}`
  }

  if (TERMINAL_OUTPUT_LINE_LIMIT <= 0) return content
  const lines = content.split("\n")
  if (lines.length <= TERMINAL_OUTPUT_LINE_LIMIT) return content

  const before = Math.floor(TERMINAL_OUTPUT_LINE_LIMIT * 0.2)
  const after = TERMINAL_OUTPUT_LINE_LIMIT - before
  const omitted = lines.length - TERMINAL_OUTPUT_LINE_LIMIT
  return `${lines.slice(0, before).join("\n")}\n\n[...${omitted} lines omitted...]\n\n${lines.slice(-after).join("\n")}`
}

// Pure formatting of raw terminal text into the bounded context string. The platform-specific
// capture (clipboard/selection on VSCode) lives in the host adapter and feeds its output here.
export function formatTerminalOutput(terminalName: string, copied: string, previousClipboard: string) {
  const trimmed = copied.trim()
  if (!trimmed || trimmed === previousClipboard) return `Active terminal: ${terminalName}\n\nNo terminal output captured.`
  return cap(truncateTerminalOutput(trimPrompt(trimmed))).content
}

export async function gitChangesContext(dir: string) {
  const probe = await run(["rev-parse", "--is-inside-work-tree"], dir, SMALL)
  if (probe.error) return `Working directory: ${dir}\n\nUnable to read git changes: ${probe.error}`
  if (probe.code !== 0 || probe.out.trim() !== "true") return `Working directory: ${dir}\n\nNot a git repository.`

  const head = await run(["rev-parse", "--verify", "HEAD"], dir, SMALL)
  if (head.error) return `Working directory: ${dir}\n\nUnable to read git changes: ${head.error}`

  const [status, diff, untracked] = await Promise.all([
    run(["status", "--short"], dir, SMALL),
    head.code === 0 ? run(["diff", "HEAD"], dir, LIMIT) : unbornDiff(dir),
    run(["ls-files", "--others", "--exclude-standard", "-z"], dir, SMALL),
  ])
  const fail = status.error ?? diff.error ?? untracked.error
  if (fail) return `Working directory: ${dir}\n\nUnable to read git changes: ${fail}`
  if (status.code !== 0 && !status.truncated) return `Working directory: ${dir}\n\nUnable to read git status:\n${output(status)}`
  if (diff.code !== 0 && !diff.truncated) return `Working directory: ${dir}\n\nUnable to read git diff:\n${output(diff)}`
  if (untracked.code !== 0 && !untracked.truncated)
    return `Working directory: ${dir}\n\nUnable to read untracked files:\n${output(untracked)}`

  const extra = await untrackedDiff(dir, untracked.out)
  const body = [diff.out.trim(), extra.content.trim()].filter(Boolean).join("\n\n")
  const changed = status.out.trim() || body.trim()
  if (!changed) return `Working directory: ${dir}\n\nNo changes in working directory.`

  const truncated = status.truncated || diff.truncated || untracked.truncated || extra.truncated
  return cap(
    `Working directory: ${dir}\n\nStatus:\n${status.out.trim() || "(empty)"}\n\nDiff:\n${body || "(empty)"}${
      truncated ? "\n\nOutput truncated." : ""
    }`,
  ).content
}

async function unbornDiff(dir: string) {
  const [cached, work] = await Promise.all([run(["diff", "--cached"], dir, LIMIT), run(["diff"], dir, LIMIT)])
  return {
    out: [cached.out.trim(), work.out.trim()].filter(Boolean).join("\n\n"),
    err: [cached.err.trim(), work.err.trim()].filter(Boolean).join("\n"),
    code: cached.code !== 0 ? cached.code : work.code,
    signal: cached.signal ?? work.signal,
    truncated: cached.truncated || work.truncated,
    error: cached.error ?? work.error,
  }
}

async function untrackedDiff(dir: string, raw: string) {
  const parts = await Promise.all(
    raw
      .split("\0")
      .filter(Boolean)
      .map(async (file) => {
        const stat = await fs.stat(path.join(dir, file)).catch(() => undefined)
        if (!stat?.isFile()) return
        if (stat.size > LIMIT) return patch(file, `<${stat.size} byte file omitted>`)
        const buffer = await fs.readFile(path.join(dir, file)).catch(() => undefined)
        if (!buffer) return patch(file, `<unreadable file: ${file}>`)
        if (buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0)) return patch(file, `<binary file omitted: ${file}>`)
        return patch(file, buffer.toString("utf8"))
      }),
  )
  return cap(parts.filter((part): part is string => !!part).join("\n\n"))
}

function patch(file: string, text: string) {
  const header = `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}`
  if (!text) return header
  const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n")
  return `${header}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join("\n")}`
}

function cap(content: string) {
  if (Buffer.byteLength(content, "utf8") <= LIMIT) return { content, truncated: false }
  return { content: Buffer.from(content, "utf8").subarray(0, LIMIT).toString("utf8"), truncated: true }
}

function output(result: Result) {
  return `${result.err.trim()}${result.err.trim() && result.out.trim() ? "\n" : ""}${result.out.trim()}`
}

function run(args: string[], cwd: string, limit: number): Promise<Result> {
  return new Promise((resolve) => {
    const state = { out: "", err: "", done: false, truncated: false }
    const child = spawn("git", args, { cwd })
    const timer = setTimeout(() => {
      state.truncated = true
      child.kill()
    }, TIMEOUT)

    const finish = (result: Pick<Result, "code" | "signal" | "error">) => {
      if (state.done) return
      state.done = true
      clearTimeout(timer)
      resolve({ out: state.out, err: state.err, truncated: state.truncated, ...result })
    }
    const collect = (key: "out" | "err", chunk: Buffer) => {
      if (state.truncated) return
      const free = limit - Buffer.byteLength(state[key], "utf8")
      if (free <= 0) {
        state.truncated = true
        child.kill()
        return
      }
      state[key] += chunk.byteLength > free ? chunk.subarray(0, free).toString("utf8") : chunk.toString("utf8")
      if (chunk.byteLength > free) {
        state.truncated = true
        child.kill()
      }
    }

    child.stdout?.on("data", (chunk: Buffer) => collect("out", chunk))
    child.stderr?.on("data", (chunk: Buffer) => collect("err", chunk))
    child.on("error", (err) => finish({ code: null, signal: null, error: err.message }))
    child.on("close", (code, signal) => finish({ code, signal }))
  })
}

export async function contextMentionAttachments(
  text: string,
  directory: string,
  captureTerminal: () => Promise<string>,
  existing: string[] = [],
) {
  return [
    hasTerminalMention(text) && !existing.includes("terminal-output.txt")
      ? attachment("terminal-output.txt", await captureTerminal(), mentionSource(text, "terminal", "terminal-output.txt"))
      : undefined,
    hasGitChangesMention(text) && !existing.includes("git-changes.txt")
      ? attachment("git-changes.txt", await gitChangesContext(directory), mentionSource(text, "git-changes", "git-changes.txt"))
      : undefined,
  ].filter((item): item is Attachment => !!item)
}
