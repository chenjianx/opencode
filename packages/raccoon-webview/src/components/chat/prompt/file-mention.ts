import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { RaccoonFileAttachment, RaccoonFileSearchItem } from "../../../protocol"
import { useVSCode } from "../../../context/vscode"

export const AT_PATTERN = /(?:^|\s)@(\S*)$/
const AT_GROUP_PATTERN = /(?:^|\s)@(file|folder)\s+(\S*)$/

const FILE_SEARCH_DEBOUNCE_MS = 150
export const SPECIAL_MENTIONS: RaccoonFileSearchItem[] = [
  { type: "file-group", path: "file", label: "File", description: "Search workspace files" },
  { type: "folder-group", path: "folder", label: "Folder", description: "Search workspace folders" },
  { type: "terminal", path: "terminal", label: "Terminal", description: "Active terminal output" },
  { type: "git-changes", path: "git-changes", label: "Git changes", description: "Current session/worktree changes" },
]

// Mention paths that don't map to a workspace file (terminal/git-changes specials and the
// file/folder group triggers). Clicking these should not attempt to open a document.
export const RESERVED_MENTION_PATHS = new Set(SPECIAL_MENTIONS.map((item) => item.path))

const TERMINAL_PATTERN = /(^|\s)@terminal(?=\s|$)/
const GIT_CHANGES_PATTERN = /(^|\s)@git-changes(?=\s|$)/

export function hasTerminalMention(text: string) {
  return TERMINAL_PATTERN.test(text)
}

export function hasGitChangesMention(text: string) {
  return GIT_CHANGES_PATTERN.test(text)
}

function mentionSource(text: string, mention: string, filename: string) {
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

export function textAttachment(text: string, mention: string, filename: string, content: string): RaccoonFileAttachment {
  return {
    path: filename,
    filename,
    mime: "text/plain",
    url: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`,
    source: mentionSource(text, mention, filename),
  }
}

export function fileName(input: string) {
  return input.split(/[\\/]/).filter(Boolean).pop() ?? input
}

export function dirName(input: string) {
  const parts = input.split(/[\\/]/).filter(Boolean)
  parts.pop()
  return parts.join("/")
}

export function mentionQuery(value: string, selectionStart: number | null) {
  const cursor = selectionStart ?? value.length
  const beforeCursor = value.slice(0, cursor)
  const groupMatch = beforeCursor.match(AT_GROUP_PATTERN)
  if (groupMatch) return { text: groupMatch[2] ?? "", kind: groupMatch[1] as "file" | "folder" }
  const match = beforeCursor.match(AT_PATTERN)
  return match ? { text: match[1] ?? "" } : undefined
}

export function mentionText(before: string, after: string, item: RaccoonFileSearchItem) {
  const pattern = before.match(AT_GROUP_PATTERN) ? AT_GROUP_PATTERN : AT_PATTERN
  const replaced = before.replace(pattern, (match) => `${match.startsWith(" ") ? " " : ""}@${item.path}`)
  return replaced + (/^\s/.test(after) ? "" : " ") + after
}

export function mentionGroupText(before: string, item: RaccoonFileSearchItem) {
  return before.replace(AT_PATTERN, (match) => `${match.startsWith(" ") ? " " : ""}@${item.path} `)
}

function encodeFilePath(filepath: string) {
  const normalized = filepath.replace(/\\/g, "/")
  const prefixed = /^[A-Za-z]:/.test(normalized) ? `/${normalized}` : normalized
  return prefixed
    .split("/")
    .map((segment, index) => {
      if (index === 1 && /^[A-Za-z]:$/.test(segment)) return segment
      return encodeURIComponent(segment)
    })
    .join("/")
}

function toFileUrl(path: string, workspaceDir: string) {
  const absolute =
    path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\") || path.startsWith("//")
      ? path
      : `${workspaceDir.replace(/[\\/]+$/, "")}/${path}`
  return `file://${encodeFilePath(absolute)}`
}

export function parseFileAttachments(text: string, mentionedPaths: Set<string>, workspaceDir: string): RaccoonFileAttachment[] {
  if (!workspaceDir) return []
  return [...mentionedPaths]
    .filter((path) => text.includes(`@${path}`))
    .filter((path) => !SPECIAL_MENTIONS.some((item) => item.path === path))
    .map((path) => ({
      path,
      filename: path.split(/[\\/]/).filter(Boolean).pop(),
      mime: "text/plain",
      url: toFileUrl(path, workspaceDir),
    }))
    .filter((item) => !!item.url)
}

export function useFileMention(query: ReturnType<typeof mentionQuery>) {
  const vscode = useVSCode()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<RaccoonFileSearchItem[]>([])
  const [selected, setSelected] = useState(0)
  const [overrideQuery, setOverrideQuery] = useState<ReturnType<typeof mentionQuery>>()
  const [mentionedPaths, setMentionedPaths] = useState<Set<string>>(new Set())
  const request = useRef(0)
  const close = useCallback(() => setOpen(false), [])
  const activeQuery = overrideQuery ?? query
  const activeQueryKey = activeQuery ? `${activeQuery.kind ?? "all"}:${activeQuery.text}` : "none"
  const specialItems = useMemo(() => {
    const normalized = activeQuery?.text.toLowerCase() ?? ""
    if (activeQuery === undefined || activeQuery.kind) return []
    return SPECIAL_MENTIONS.filter((item) => item.path.startsWith(normalized) || item.label?.toLowerCase().startsWith(normalized))
  }, [activeQueryKey])
  const exactSpecialMention = useMemo(() => {
    const normalized = activeQuery?.text.toLowerCase() ?? ""
    if (activeQuery === undefined || activeQuery.kind) return false
    return SPECIAL_MENTIONS.some((item) => item.path === normalized || item.label?.toLowerCase() === normalized)
  }, [activeQueryKey])

  useEffect(() => {
    if (overrideQuery && query?.kind === overrideQuery.kind) setOverrideQuery(undefined)
    if (overrideQuery && query === undefined) setOverrideQuery(undefined)
  }, [overrideQuery, query])

  useEffect(() => {
    return vscode.onMessage((message) => {
      if (message.type !== "fileSearchResult") return
      if (message.requestID !== `file-search-${request.current}`) return
      setItems([...specialItems, ...message.items])
      setSelected(0)
    })
  }, [specialItems, vscode])

  useEffect(() => {
    if (activeQuery === undefined) {
      setOpen(false)
      setItems([])
      setSelected(0)
      return
    }
    setOpen(true)
    setItems(specialItems)
    if (!activeQuery.kind) return
    if (exactSpecialMention) return
    const timer = setTimeout(() => {
      request.current++
      vscode.postMessage({ type: "requestFileSearch", requestID: `file-search-${request.current}`, query: activeQuery.text, kind: activeQuery.kind })
    }, FILE_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [activeQueryKey, exactSpecialMention, specialItems, vscode])

  return useMemo(
    () => ({
      open,
      items,
      selected,
      mentionedPaths,
      visible: open && items.length > 0,
      close,
      setSelected,
      next: () => setSelected((index) => (index + 1) % Math.max(items.length, 1)),
      previous: () => setSelected((index) => (index - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1)),
      showKind: (kind: "file" | "folder") => setOverrideQuery({ text: "", kind }),
      addMentionedPath: (path: string) => setMentionedPaths((current) => new Set([...current, path])),
      clearMentionedPaths: () => setMentionedPaths(new Set()),
      parseFileAttachments: (text: string, workspaceDir: string) => parseFileAttachments(text, mentionedPaths, workspaceDir),
    }),
    [items, mentionedPaths, open, selected],
  )
}
