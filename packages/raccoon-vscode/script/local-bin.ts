#!/usr/bin/env bun
import { $ } from "bun"
import { chmodSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs"
import { basename, dirname, join, relative } from "node:path"

const dir = join(import.meta.dir, "..")
const opencodeDir = join(dir, "..", "opencode")
const targetDir = join(dir, "bin")
const binName = process.platform === "win32" ? "opencode.exe" : "opencode"
const targetPath = join(targetDir, binName)

async function findBuiltBinary() {
  const distDir = join(opencodeDir, "dist")
  if (!existsSync(distDir)) return

  for await (const entry of new Bun.Glob("**/*").scan({ cwd: distDir, absolute: true })) {
    if (basename(entry) !== binName) continue
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
  if (!built) throw new Error(`Could not find a built opencode binary in ${relative(dir, join(opencodeDir, "dist"))}`)
  return built
}

const source = await ensureBuiltBinary()
mkdirSync(targetDir, { recursive: true })

if (existsSync(targetPath)) {
  rmSync(targetPath)
}

await $`cp ${source} ${targetPath}`
chmodSync(targetPath, 0o755)
console.log(`Copied opencode binary to ${relative(dir, targetPath)}`)
