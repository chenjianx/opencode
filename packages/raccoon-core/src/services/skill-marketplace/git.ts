import { execFile } from "node:child_process"

export type GitResult = {
  ok: boolean
  stdout: string
  stderr: string
  message?: string
}

export function runGit(args: string[], options?: { cwd?: string; timeoutMs?: number }): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd: options?.cwd,
        timeout: options?.timeoutMs ?? 60_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        maxBuffer: 1024 * 1024 * 20,
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout,
          stderr,
          message: error instanceof Error ? error.message : undefined,
        })
      },
    )
  })
}

export async function assertGitAvailable() {
  const result = await runGit(["--version"], { timeoutMs: 10_000 })
  if (result.ok) return { ok: true as const }
  return { ok: false as const, error: result.message || result.stderr || "git is not available in PATH." }
}

export function looksLikeAuthError(message: string) {
  const lower = message.toLowerCase()
  return lower.includes("authentication failed") || lower.includes("permission denied") || lower.includes("could not read username")
}
