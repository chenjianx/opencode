#!/usr/bin/env bun
import { $ } from "bun"
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs"
import { basename, dirname, join, relative } from "node:path"

const dir = join(import.meta.dir, "..")
const opencodeDir = join(dir, "..", "opencode")
const targetDir = join(dir, "bin")
// The upstream build now emits a binary named `raccoon`; we locate that
// artifact and bundle it into the extension under the same name.
const sourceBinName = process.platform === "win32" ? "raccoon.exe" : "raccoon"
const targetBinName = process.platform === "win32" ? "raccoon.exe" : "raccoon"
const targetPath = join(targetDir, targetBinName)

async function findBuiltBinary() {
  const distDir = join(opencodeDir, "dist")
  if (!existsSync(distDir)) return

  for await (const entry of new Bun.Glob("**/*").scan({ cwd: distDir, absolute: true })) {
    if (basename(entry) !== sourceBinName) continue
    if (basename(dirname(entry)) !== "bin") continue
    try {
      statSync(entry)
      return entry
    } catch {
      continue
    }
  }
}

async function ensureBuiltBinary() {
  const existing = await findBuiltBinary()
  if (existing) return existing

  await $`bun run --cwd ${opencodeDir} build --single`
  const built = await findBuiltBinary()
  if (!built) throw new Error(`Could not find a built raccoon binary in ${relative(dir, join(opencodeDir, "dist"))}`)
  return built
}

const source = await ensureBuiltBinary()
mkdirSync(targetDir, { recursive: true })

// Drop any previously bundled binaries (e.g. an old `opencode`) so the
// extension package never ships a stale executable alongside `raccoon`.
for (const entry of readdirSync(targetDir)) {
  if (entry === ".gitignore") continue
  rmSync(join(targetDir, entry), { recursive: true, force: true })
}

await $`cp ${source} ${targetPath}`
chmodSync(targetPath, 0o755)
console.log(`Copied raccoon binary to ${relative(dir, targetPath)}`)
