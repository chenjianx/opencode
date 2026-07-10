export class FetchModelsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "FetchModelsError"
  }

  get auth() {
    return this.status === 401 || this.status === 403
  }
}

export async function fetchOpenAIModels(input: { baseURL: string; apiKey?: string; headers?: Record<string, string> }) {
  const response = await fetch(`${input.baseURL.replace(/\/+$/, "")}/models`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(input.headers ?? {}),
      ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new FetchModelsError(`HTTP ${response.status}: ${text.slice(0, 200)}`, response.status)
  }
  const body = (await response.json()) as {
    data?: Array<{
      id?: string
      name?: string
      modalities?: {
        input?: Array<string>
        output?: Array<string>
      }
    }>
  }
  const seen = new Set<string>()
  return (body.data ?? [])
    .map((item) => {
      const id = typeof item.id === "string" ? item.id.trim() : ""
      if (!id || seen.has(id)) return
      seen.add(id)
      return {
        id,
        name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : id,
        supportsImage: item.modalities?.input?.includes("image") ?? false,
      }
    })
    .filter((item): item is { id: string; name: string; supportsImage: boolean } => !!item)
    .sort((a, b) => a.id.localeCompare(b.id))
}
