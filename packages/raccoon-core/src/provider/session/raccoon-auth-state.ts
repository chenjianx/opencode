import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

// Mirrors how the opencode core resolves its auth store: `path.join(Global.Path.data,
// "auth.json")`, where Global.Path.data is `<xdgData>/raccoon` after the Raccoon rebrand
// (packages/core/src/global.ts: `const app = "raccoon"`). The VS Code extension launches the
// backend with the same `process.env`, so resolving the path here yields the exact same file
// the server reads/writes. NOTE: this must stay "raccoon" — pointing at the legacy "opencode"
// dir makes the webview read a stale token the server can't see, so the UI enters the chat
// while every request fails with no usable credential.
function authFilePath() {
  const xdgData = process.env.XDG_DATA_HOME?.trim() || path.join(os.homedir(), ".local", "share")
  return path.join(xdgData, "raccoon", "auth.json")
}

function raccoonOauth(data: unknown): Record<string, unknown> | undefined {
  if (!data || typeof data !== "object") return undefined
  const entry = (data as Record<string, unknown>)["raccoon"]
  if (!entry || typeof entry !== "object") return undefined
  const record = entry as Record<string, unknown>
  if (record.type !== "oauth" || typeof record.refresh !== "string" || record.refresh.length === 0) return undefined
  return record
}

function hasRaccoonOauth(data: unknown): boolean {
  return raccoonOauth(data) !== undefined
}

// Read the `exp` claim (seconds since epoch) from a JWT, or undefined if the token is
// not a parseable JWT. Used only to decide whether the stored login is already dead.
function parseJwtExp(token: string): number | undefined {
  const parts = token.split(".")
  const payloadSegment = parts[1]
  if (parts.length !== 3 || !payloadSegment) return undefined
  try {
    const payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString()) as { exp?: number }
    return typeof payload.exp === "number" ? payload.exp : undefined
  } catch {
    return undefined
  }
}

function refreshTokenExpired(data: unknown): boolean {
  const record = raccoonOauth(data)
  if (!record) return false
  const exp = parseJwtExp(record.refresh as string)
  // Only declare the login dead when we can read a concrete expiry that is already in the
  // past. A missing/opaque exp must NOT lock the user out — let the server be the judge.
  if (exp === undefined) return false
  return exp * 1000 <= Date.now()
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

/**
 * True when a Raccoon OAuth credential exists but its refresh token has already expired.
 * In that state no silent token refresh is possible, so the stored credentials are dead and
 * the session can never reach the API — the host should clear them and surface the sign-in
 * screen rather than leave the user in a broken interface. Server-side revocation of a
 * not-yet-expired token is not visible here; that case is still handled by the reauth
 * marker on the failing request.
 */
export async function isRaccoonLoginExpired(): Promise<boolean> {
  const inline = process.env.OPENCODE_AUTH_CONTENT
  if (inline) {
    try {
      return refreshTokenExpired(JSON.parse(inline))
    } catch {
      // fall through to the file
    }
  }
  try {
    const raw = await fs.readFile(authFilePath(), "utf8")
    return refreshTokenExpired(JSON.parse(raw))
  } catch {
    return false
  }
}
