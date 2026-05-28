import * as vscode from "vscode"
import type { RaccoonFileSearchItem } from "@opencode-ai/raccoon-webview"

const ignoredFolders = new Set([
  "node_modules",
  "bower_components",
  ".pnpm-store",
  "vendor",
  ".npm",
  "dist",
  "build",
  "out",
  ".next",
  "target",
  "bin",
  "obj",
  ".git",
  ".svn",
  ".hg",
  ".vscode",
  ".idea",
  ".turbo",
  ".output",
  "desktop",
  ".sst",
  ".cache",
  ".webkit-cache",
  "__pycache__",
  ".pytest_cache",
  "mypy_cache",
  ".history",
  ".gradle",
])

function ignoredFile(relative: string) {
  const parts = relative.split("/")
  if (parts.some((part) => ignoredFolders.has(part))) return true
  const name = parts.at(-1) ?? relative
  return (
    name === ".DS_Store" ||
    name === "Thumbs.db" ||
    name.endsWith(".swp") ||
    name.endsWith(".swo") ||
    name.endsWith(".pyc") ||
    name.endsWith(".log") ||
    parts.includes("logs") ||
    parts.includes("tmp") ||
    parts.includes("temp") ||
    parts.includes("coverage") ||
    parts.includes(".nyc_output")
  )
}

function ignoredFolder(relative: string) {
  return relative.split("/").some((part) => ignoredFolders.has(part))
}

function matchScore(query: string, value: string) {
  const normalized = query.trim().replaceAll("\\", "/").toLowerCase()
  if (!normalized) return 0
  const target = value.toLowerCase()
  if (target.includes(normalized)) return normalized.length - target.indexOf(normalized) / 100
  const result = [...normalized].reduce(
    (state, char) => {
      const index = target.indexOf(char, state.index + 1)
      if (index === -1) return { ...state, failed: true }
      return {
        index,
        failed: state.failed,
        score: state.score + 1 / (index - state.index),
      }
    },
    { index: -1, score: 0, failed: false },
  )
  return result.failed ? undefined : result.score
}

function basename(value: string) {
  const clean = value.replace(/\/+$/, "")
  return clean.split("/").pop() ?? clean
}

function depth(value: string) {
  return value.split("/").length - 1
}

export async function searchFiles(input: {
  query: string
  kind?: "file" | "folder"
}): Promise<{ workspaceDir: string; items: RaccoonFileSearchItem[] }> {
  const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!workspaceDir) return { workspaceDir: "", items: [] }

  const uris = await vscode.workspace.findFiles("**/*", "**/{node_modules,.git,.hg,.svn,dist,build,out,coverage}/**", 200)
  const seen = new Set<string>()
  const items: Array<RaccoonFileSearchItem & { score: number }> = []

  for (const uri of uris) {
    const relative = vscode.workspace.asRelativePath(uri, false).replaceAll("\\", "/")
    if (!relative || ignoredFile(relative)) continue

    const fileScore = matchScore(input.query, relative)
    if (fileScore === undefined) continue
    if (input.kind !== "folder" && !seen.has(`file:${relative}`)) {
      seen.add(`file:${relative}`)
      items.push({ path: relative, type: "file", score: fileScore })
    }

    const parts = relative.split("/")
    parts.pop()
    while (parts.length > 0) {
      const folder = parts.join("/")
      if (ignoredFolder(folder)) break
      const folderScore = matchScore(input.query, folder)
      if (input.kind !== "file" && !seen.has(`folder:${folder}`) && folderScore !== undefined) {
        seen.add(`folder:${folder}`)
        items.push({ path: folder, type: "folder", score: folderScore })
      }
      parts.pop()
    }
  }

  return {
    workspaceDir,
    items: [...items]
      .sort(
        (a, b) =>
          b.score - a.score ||
          basename(a.path).localeCompare(basename(b.path)) ||
          depth(a.path) - depth(b.path) ||
          a.path.localeCompare(b.path),
      )
      .map(({ score: _score, ...item }) => item),
  }
}
