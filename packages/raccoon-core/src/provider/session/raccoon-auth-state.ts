import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

// Mirrors how the opencode core resolves its auth store (packages/core/src/global.ts:
// `path.join(xdgData, "opencode", "auth.json")`). The VS Code extension launches the
// backend with the same `process.env`, so resolving the path here yields the exact same
// file the server reads/writes.
function authFilePath() {
  const xdgData = process.env.XDG_DATA_HOME?.trim() || path.join(os.homedir(), ".local", "share")
  return path.join(xdgData, "opencode", "auth.json")
}

function hasRaccoonOauth(data: unknown): boolean {
  if (!data || typeof data !== "object") return false
  const entry = (data as Record<string, unknown>)["raccoon"]
  if (!entry || typeof entry !== "object") return false
  const record = entry as Record<string, unknown>
  return record.type === "oauth" && typeof record.refresh === "string" && record.refresh.length > 0
}

/**
 * Ground-truth check for whether the user is signed in to Raccoon: does a raccoon OAuth
 * credential exist in the opencode auth store. This is reliable across restarts and is
 * NOT affected by the provider list's `connected` flag, which always reports raccoon as
 * connected because it is registered as a config-source provider.
 */
export async function isRaccoonLoggedIn(): Promise<boolean> {
  // Auth can be injected via env in some setups; honour it the same way core does.
  const inline = process.env.OPENCODE_AUTH_CONTENT
  if (inline) {
    try {
      return hasRaccoonOauth(JSON.parse(inline))
    } catch {
      // fall through to the file
    }
  }
  try {
    const raw = await fs.readFile(authFilePath(), "utf8")
    return hasRaccoonOauth(JSON.parse(raw))
  } catch {
    return false
  }
}
