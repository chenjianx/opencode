#!/usr/bin/env bun
import { $ } from "bun"
import { join } from "node:path"
import { stageBinary, TARGETS } from "./local-bin.ts"
import pkg from "../package.json"

const dir = join(import.meta.dir, "..")

// Platform targets to build VSIX files for. Each produces a dedicated,
// platform-specific package containing only that platform's `raccoon` binary.
const PACKAGE_TARGETS = ["darwin-arm64", "darwin-x64", "win32-x64", "linux-x64"]

const vsceSecretArgs = [
  "--no-dependencies",
  "--allow-package-secrets",
  "github",
  "--allow-package-secrets",
  "slack",
]

// 1. Build the shared (platform-agnostic) artifacts once: webview + bundled JS.
console.log("Building shared artifacts (webview + extension bundle)…")
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
  const out = join(dir, `raccoon-${target}-${pkg.version}.vsix`)
  await $`vsce package --target ${target} ${vsceSecretArgs} -o ${out}`.cwd(dir)
  produced.push(out)
}

console.log("\nProduced VSIX packages:")
for (const p of produced) console.log(`  ${p}`)
