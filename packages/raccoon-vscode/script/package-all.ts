#!/usr/bin/env bun
import { $ } from "bun"
import { join } from "node:path"
import { mkdir, rm } from "node:fs/promises"
import { stageBinary, TARGETS } from "./local-bin.ts"
import pkg from "../package.json"

const dir = join(import.meta.dir, "..")
const outDir = join(dir, "build")

// Platform targets to build VSIX files for. Each produces a dedicated,
// platform-specific package containing only that platform's `raccoon` binary.
const PACKAGE_TARGETS = [
  "darwin-arm64",
  "darwin-x64",
  "win32-arm64",
  "win32-x64",
  "linux-arm64",
  "linux-x64",
  "alpine-arm64",
  "alpine-x64",
]

const vsceSecretArgs = [
  "--no-dependencies",
  "--allow-package-secrets",
  "github",
  "--allow-package-secrets",
  "slack",
]

// 1. Build the shared (platform-agnostic) artifacts once: webview + bundled JS.
console.log("Building shared artifacts (webview + extension bundle)…")
await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
await $`bun run --cwd ${dir} build:webview`
await $`bun run --cwd ${dir} check-types`
await $`bun run --cwd ${dir} lint`
await $`node ${join(dir, "esbuild.cjs")} --production`.cwd(dir)

// 2. Trigger the upstream full cross-compile once (staging the first target
//    builds every platform's binary because local-bin omits `--single`).
//    Subsequent targets reuse the already-built artifacts.

// 3. For each target: stage its binary into bin/ and package a per-target VSIX.
const produced: string[] = []
for (const target of PACKAGE_TARGETS) {
  if (!TARGETS[target]) throw new Error(`Unknown target ${target}`)
  console.log(`\n=== Packaging ${target} ===`)
  await stageBinary(target)
  const out = join(outDir, `raccoon-${target}-${pkg.version}.vsix`)
  // `vsce package` re-runs the `vscode:prepublish` script, which invokes local-bin.ts
  // again. Without this env var local-bin defaults to the current platform and would
  // overwrite the just-staged binary — so every per-target VSIX ended up with the host's
  // binary. Pin the target so the prepublish rebuild stages the correct one.
  await $`vsce package --target ${target} ${vsceSecretArgs} -o ${out}`.cwd(dir).env({
    ...process.env,
    RACCOON_PACKAGE_TARGET: target,
  })
  produced.push(out)
}

console.log("\nProduced VSIX packages:")
for (const p of produced) console.log(`  ${p}`)
