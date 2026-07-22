import { parseDiffFromFile, parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs"
import { FileDiff } from "@pierre/diffs/react"
import type { RaccoonMessagePart } from "../../../protocol"
import { firstString, numberValue, record, stringValue } from "./message-list-format"

export type DiffFile = {
  path: string
  additions: number
  deletions: number
  status?: "added" | "deleted" | "modified"
  fileDiff?: FileDiffMetadata
  patchText?: string
  oldText?: string
  newText?: string
}

function diffStatus(value: unknown): DiffFile["status"] {
  if (value === "added" || value === "deleted" || value === "modified") return value
  if (value === "add") return "added"
  if (value === "delete") return "deleted"
  return "modified"
}

function diffFile(value: unknown, fallbackPath?: string): DiffFile | undefined {
  const item = record(value)
  if (!item) return

  const path =
    stringValue(item.relativePath) ??
    stringValue(item.file) ??
    stringValue(item.filePath) ??
    stringValue(item.path) ??
    fallbackPath
  if (!path) return

  const patchText =
    stringValue(item.patchText) ??
    stringValue(item.patch) ??
    stringValue(item.diff) ??
    stringValue(item.unified_diff) ??
    stringValue(item.unifiedDiff)
  const before = stringValue(item.before) ?? stringValue(item.oldString)
  const after = stringValue(item.after) ?? stringValue(item.newString) ?? stringValue(item.content)
  const patchFiles = patchText ? parsePatchFiles(patchText).flatMap((patch) => patch.files) : []
  const fileDiff = patchText
    ? patchFiles.find((file) => file.name === path || file.prevName === path || !file.name) ?? patchFiles[0]
    : before !== undefined || after !== undefined
      ? parseDiffFromFile(
          { name: path, contents: before ?? "" },
          { name: path, contents: after ?? "" },
        )
      : undefined
  if (!fileDiff) return

  return {
    path,
    additions: numberValue(item.additions),
    deletions: numberValue(item.deletions),
    status: diffStatus(item.status ?? item.type),
    fileDiff,
    patchText,
    oldText: before,
    newText: after,
  }
}

export function diffFiles(part: RaccoonMessagePart) {
  const fallbackPath = firstString(part.input, ["filePath", "filepath", "file", "target_file"])
  const metadataDiff = stringValue(part.metadata?.diff)
  const files = part.metadata?.files
  if (Array.isArray(files)) return files.map((item) => diffFile(item, fallbackPath)).filter((item): item is DiffFile => !!item)

  const filediff = diffFile(part.metadata?.filediff, fallbackPath)
  if (filediff) return [filediff]

  if (metadataDiff) {
    const parsed = parsePatchFiles(metadataDiff).flatMap((patch) => patch.files).map((fileDiff) => ({
      path: fileDiff.name,
      additions: fileDiff.additionLines.length,
      deletions: fileDiff.deletionLines.length,
      status: diffStatus(fileDiff.type),
      fileDiff,
      patchText: metadataDiff,
    }))
    if (parsed.length > 0) return parsed
  }

  const inputBefore = stringValue(part.input?.oldString) ?? stringValue(part.input?.before)
  const inputAfter = stringValue(part.input?.newString) ?? stringValue(part.input?.after) ?? stringValue(part.input?.content)
  if ((inputBefore !== undefined || inputAfter !== undefined) && fallbackPath) {
    const fileDiff = parseDiffFromFile(
      { name: fallbackPath, contents: inputBefore ?? "" },
      { name: fallbackPath, contents: inputAfter ?? "" },
    )
    return [{
      path: fallbackPath,
      additions: numberValue(part.input?.additions),
      deletions: numberValue(part.input?.deletions),
      status: diffStatus(part.input?.status),
      fileDiff,
      oldText: inputBefore,
      newText: inputAfter,
    }]
  }

  return []
}

export function DiffPanel(props: { files: DiffFile[] }) {
  return (
    <div className="tool-diff-panel">
      {props.files.map((file) => (
        <details className="tool-diff-file" key={`${file.path}-${file.fileDiff?.cacheKey ?? file.path}`} open={file.status !== "deleted"}>
          <summary className="tool-diff-file-head">
            <span className="tool-diff-file-path" title={file.path}>{file.path}</span>
            <span className="tool-diff-stats">
              {file.additions > 0 ? <span className="tool-diff-added">+{file.additions}</span> : null}
              {file.deletions > 0 ? <span className="tool-diff-removed">-{file.deletions}</span> : null}
              {file.status ? <span className="tool-diff-status">{file.status}</span> : null}
            </span>
          </summary>
          <div className="tool-diff-body">
            <div className="tool-react-diff-wrap">
              <ReactDiff file={file} />
            </div>
          </div>
        </details>
      ))}
    </div>
  )
}

function ReactDiff(props: { file: DiffFile }) {
  if (!props.file.fileDiff) return null

  const themeType = document.body.classList.contains("vscode-dark") || document.body.classList.contains("vscode-high-contrast")
    ? "dark"
    : document.body.classList.contains("vscode-light") || document.body.classList.contains("vscode-high-contrast-light")
      ? "light"
      : "system"

  return (
    <FileDiff
      fileDiff={props.file.fileDiff}
      className="tool-pierre-diff"
      options={{
        collapsed: false,
        diffStyle: "unified",
        diffIndicators: "bars",
        disableFileHeader: true,
        hunkSeparators: "simple",
        lineDiffType: "word-alt",
        overflow: "scroll",
        theme: {
          dark: "github-dark",
          light: "github-light",
        },
        themeType,
      }}
      metrics={{
        hunkLineCount: 50,
        lineHeight: 20,
        diffHeaderHeight: 0,
        hunkSeparatorHeight: 24,
        spacing: 0,
      }}
    />
  )
}
