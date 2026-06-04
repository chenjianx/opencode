import { Effect } from "effect"
import * as path from "path"

// raccoon_change - extraction layer: directory file inlining moved out of src/tool/read.ts
// Keeps the upstream read tool to a single import + seam so upstream merges stay clean.

const DIRECTORY_CONCURRENCY = 8

export type DirectoryFile = {
  filepath: string
  content: string
}

type LinesResult = {
  raw: string[]
  count: number
  cut: boolean
  more: boolean
  offset: number
}

// Helpers are passed in from the ReadTool closure. Error channels are left open
// (every call is wrapped in Effect.catch below); requirement channels are already
// resolved against FSUtil in the caller, so they stay `never`.
export type InlineDirectoryDeps = {
  fs: {
    readDirectoryEntries: (filepath: string) => Effect.Effect<ReadonlyArray<{ name: string; type: string }>, any, never>
    stat: (filepath: string) => Effect.Effect<{ type: string; size: number | bigint }, any, never>
  }
  readSample: (filepath: string, fileSize: number, sampleSize: number) => Effect.Effect<Uint8Array, any, never>
  lines: (filepath: string, opts: { limit: number; offset: number }) => Effect.Effect<LinesResult, any, never>
  isBinaryFile: (filepath: string, bytes: Uint8Array) => boolean
  sampleBytes: number
  defaultReadLimit: number
}

/**
 * For a directory mention, inline the textual content of its (non-binary) files.
 * Mirrors the previous inline `readDirectoryFiles` in src/tool/read.ts verbatim;
 * the ReadTool closure passes its own helpers in as `deps`.
 */
export const inlineDirectory = Effect.fn("RaccoonRead.inlineDirectory")(function* (
  deps: InlineDirectoryDeps,
  filepath: string,
  items: string[],
  directory: string,
) {
  const { fs, readSample, lines, isBinaryFile, sampleBytes, defaultReadLimit } = deps
  const entries = yield* fs.readDirectoryEntries(filepath).pipe(Effect.catch(() => Effect.succeed([])))
  const types = new Map(entries.map((entry) => [entry.name, entry.type]))
  const files = yield* Effect.forEach(
    items.filter((item) => !item.endsWith("/") && types.get(item) === "file"),
    Effect.fnUntraced(function* (item) {
      const child = path.join(filepath, item)
      const info = yield* fs.stat(child).pipe(Effect.catch(() => Effect.void))
      if (info?.type !== "File") return
      const sample = yield* readSample(child, Number(info.size), sampleBytes).pipe(
        Effect.catch(() => Effect.succeed(new Uint8Array())),
      )
      if (isBinaryFile(child, sample)) return
      const file = yield* lines(child, { limit: defaultReadLimit, offset: 1 }).pipe(Effect.catch(() => Effect.void))
      if (!file) return
      const rel = path.relative(directory, child).replaceAll("\\", "/")
      const note = file.cut || file.more ? "\n\n(File truncated)" : ""
      return {
        filepath: child,
        content: `<file_content path="${rel}">\n${file.raw.join("\n")}${note}\n</file_content>`,
      }
    }),
    { concurrency: DIRECTORY_CONCURRENCY },
  )
  return files.filter((item): item is DirectoryFile => item !== undefined)
})

export * as RaccoonRead from "./read"
