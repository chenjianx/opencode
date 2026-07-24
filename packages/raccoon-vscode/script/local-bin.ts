#!/usr/bin/env bun
import { $ } from "bun"
import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const dir = join(import.meta.dir, "..")
const opencodeDir = join(dir, "..", "opencode")
const targetDir = join(dir, "bin")

// Map a VS Code platform target (as accepted by `vsce package --target`) to the
// upstream `raccoon` dist directory name and the binary file name produced
// inside it. Keep this in sync with packages/opencode/script/build.ts.
export const TARGETS: Record<string, { distDir: string; binName: string }> = {
  "darwin-arm64": { distDir: "raccoon-darwin-arm64", binName: "raccoon" },
  "darwin-x64": { distDir: "raccoon-darwin-x64", binName: "raccoon" },
  "alpine-arm64": { distDir: "raccoon-linux-arm64-musl", binName: "raccoon" },
  "alpine-x64": { distDir: "raccoon-linux-x64-musl", binName: "raccoon" },
  "linux-arm64": { distDir: "raccoon-linux-arm64", binName: "raccoon" },
  "linux-x64": { distDir: "raccoon-linux-x64", binName: "raccoon" },
  "win32-arm64": { distDir: "raccoon-windows-arm64", binName: "raccoon.exe" },
  "win32-x64": { distDir: "raccoon-windows-x64", binName: "raccoon.exe" },
}

function currentTarget() {
  const arch = process.arch === "arm64" ? "arm64" : "x64"
  if (process.platform !== "linux") return `${process.platform}-${arch}`
  if (existsSync("/etc/alpine-release")) return `alpine-${arch}`
  const ldd = spawnSync("ldd", ["--version"], { encoding: "utf8" })
  const output = `${ldd.stdout ?? ""}${ldd.stderr ?? ""}`.toLowerCase()
  return `${output.includes("musl") ? "alpine" : "linux"}-${arch}`
}

// Resolve the requested target: `--target <t>` flag, else the RACCOON_PACKAGE_TARGET
// env var (set by package-all.ts so the prepublish-triggered rebuild stages the right
// binary instead of silently falling back to the current platform), else current platform.
function resolveTarget(): string {
  const idx = process.argv.indexOf("--target")
  const requested = idx !== -1 ? process.argv[idx + 1] : process.env.RACCOON_PACKAGE_TARGET || currentTarget()
  if (!requested || !TARGETS[requested]) {
    throw new Error(`Unsupported target "${requested}". Supported: ${Object.keys(TARGETS).join(", ")}`)
  }
  return requested
}

function sourceBinaryPath(target: string) {
  const { distDir, binName } = TARGETS[target]
  return join(opencodeDir, "dist", distDir, "bin", binName)
}

function findBuiltBinary(target: string) {
  const sourcePath = sourceBinaryPath(target)
  if (!existsSync(sourcePath)) return undefined
  try {
    statSync(sourcePath)
    return sourcePath
  } catch {
    return undefined
  }
}

async function ensureBuiltBinary(target: string) {
  const existing = findBuiltBinary(target)
  if (existing) return existing

  // No `--single`: produce binaries for every supported platform in one pass so
  // subsequent per-target packaging just reuses the already-built artifacts.
  await $`bun run --cwd ${opencodeDir} build`
  const built = findBuiltBinary(target)
  if (!built) {
    throw new Error(`Could not find built raccoon binary for ${target} at ${relative(dir, sourceBinaryPath(target))}`)
  }
  return built
}

// Place the binary for `target` into bin/, replacing any previously bundled one.
export async function stageBinary(target: string) {
  const { binName } = TARGETS[target]
  const source = await ensureBuiltBinary(target)
  const targetPath = join(targetDir, binName)
  mkdirSync(targetDir, { recursive: true })

  // Drop any previously bundled binaries (e.g. one for another platform) so the
  // extension package never ships a stale or mismatched executable.
  for (const entry of readdirSync(targetDir)) {
    if (entry === ".gitignore") continue
    rmSync(join(targetDir, entry), { recursive: true, force: true })
  }

  await $`cp ${source} ${targetPath}`
  if (!target.startsWith("win32")) chmodSync(targetPath, 0o755)
  console.log(`Copied ${target} raccoon binary to ${relative(dir, targetPath)}`)
  return targetPath
}

// When run directly (not imported), stage the binary for the resolved target.
if (import.meta.main) {
  await stageBinary(resolveTarget())
}
