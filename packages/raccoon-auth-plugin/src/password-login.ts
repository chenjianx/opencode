import { createCipheriv, randomBytes } from "node:crypto"

type PasswordLoginResponse = {
  data?: {
    access_token?: string
    refresh_token?: string
  }
  error?: {
    message?: string
  }
  message?: string
  details?: string
}

const PHONE_COUNTRY_CODES = new Set(["86", "852", "853", "81"])
const PASSWORD_LOGIN_TIMEOUT_MS = 30_000

function encrypt(value: string) {
  const iv = randomBytes(16)
  const cipher = createCipheriv("aes-128-cfb", new TextEncoder().encode("senseraccoon2023"), iv)
  return Buffer.concat([iv, cipher.update(value, "utf8"), cipher.final()]).toString("base64")
}

export async function loginWithPhone(input: {
  baseUrl: string
  nationCode: string
  phone: string
  password: string
  signal?: AbortSignal
}) {
  if (!input.nationCode || !input.phone || !input.password) throw new Error("Phone number and password are required")
  if (!PHONE_COUNTRY_CODES.has(input.nationCode)) throw new Error("Unsupported phone country code")

  const baseUrl = new URL(input.baseUrl)
  const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(baseUrl.hostname)
  if (baseUrl.protocol !== "https:" && !(baseUrl.protocol === "http:" && local)) {
    throw new Error("Phone sign-in requires HTTPS for non-local servers")
  }
  baseUrl.search = ""
  baseUrl.hash = ""

  const response = await fetch(`${baseUrl.toString().replace(/\/+$/, "")}/api/plugin/auth/v1/login_with_password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "error",
    signal: input.signal ?? AbortSignal.timeout(PASSWORD_LOGIN_TIMEOUT_MS),
    body: JSON.stringify({
      nation_code: input.nationCode,
      phone: encrypt(input.phone),
      password: encrypt(input.password),
    }),
  })
  const json = (await response.json().catch(() => ({}))) as PasswordLoginResponse
  if (!response.ok) {
    throw new Error(json.error?.message || json.message || json.details || `Login failed: ${response.status}`)
  }

  const access = json.data?.access_token
  const refresh = json.data?.refresh_token
  if (!access || !refresh) throw new Error("Login failed: missing tokens")
  return { access, refresh }
}
