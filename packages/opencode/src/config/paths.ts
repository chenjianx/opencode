export * as ConfigPaths from "./paths"

import path from "path"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Global } from "@opencode-ai/core/global"
import { unique } from "remeda"
import * as Effect from "effect/Effect"
import { FSUtil } from "@opencode-ai/core/fs-util"

export const files = Effect.fn("ConfigPaths.projectFiles")(function* (
  names: string | string[], // raccoon_change - accept multiple base names (raccoon + opencode)
  directory: string,
  worktree?: string,
) {
  const afs = yield* FSUtil.Service
  // raccoon_change start - expand multiple base names, priority order preserved
  // Higher-priority base names (e.g. "raccoon") come first so they end up merged
  // last after `toReversed`, winning over fallback names (e.g. "opencode").
  const targets = (Array.isArray(names) ? names : [names]).flatMap((name) => [`${name}.jsonc`, `${name}.json`])
  // raccoon_change end
  return (yield* afs.up({
    targets,
    start: directory,
    stop: worktree,
  })).toReversed()
})

export const directories = Effect.fn("ConfigPaths.directories")(function* (directory: string, worktree?: string) {
  const afs = yield* FSUtil.Service
  return unique([
    Global.Path.config,
    ...(!Flag.OPENCODE_DISABLE_PROJECT_CONFIG
      ? yield* afs.up({
          targets: [".raccoon", ".opencode"], // raccoon_change - discover .raccoon dirs in project tree
          start: directory,
          stop: worktree,
        })
      : []),
    ...(yield* afs.up({
      targets: [".raccoon", ".opencode"], // raccoon_change - discover .raccoon dirs in home
      start: Global.Path.home,
      stop: Global.Path.home,
    })),
    ...(Flag.OPENCODE_CONFIG_DIR ? [Flag.OPENCODE_CONFIG_DIR] : []),
  ])
})

export function fileInDirectory(dir: string, name: string) {
  return [path.join(dir, `${name}.json`), path.join(dir, `${name}.jsonc`)]
}
