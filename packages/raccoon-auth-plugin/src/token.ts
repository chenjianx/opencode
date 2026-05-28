export function getRaccoonUrlFromToken(defaultUrl: string, token: string): string {
  if (!token) return defaultUrl

  const match = token.match(/^(https?:\/\/[^:]+(?::\d+)?(?:\/[^:]*)?):/)
  if (!match) return defaultUrl

  try {
    return new URL(match[1]).toString().replace(/\/+$/, "")
  } catch {
    return defaultUrl
  }
}

export function isValidRaccoonToken(token: string): boolean {
  return typeof token === "string" && token.length > 10
}

export function getRaccoonBaseUrl(input?: string) {
  const value = input?.trim()
  if (!value) return "http://10.4.196.193:5580"
  return value.replace(/\/+$/, "")
}
