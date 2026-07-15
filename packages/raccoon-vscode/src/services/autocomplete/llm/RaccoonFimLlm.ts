import type { RaccoonConnectionService } from "../../cli-backend/index.js"
import { getAutocompleteModel } from "@opencode-ai/raccoon-core"
import type { ILLM } from "./types.js"

/** Shape of one SSE frame emitted by the backend `/fim` endpoint. */
interface FimChunk {
  type: "delta" | "done" | "error"
  text?: string
  message?: string
}

/**
 * FIM-only ILLM implementation backed by the raccoon `/fim` endpoint. Wraps
 * `client.fim.complete`'s SSE stream into an `AsyncGenerator<string>` so the
 * generation pipeline (GeneratorReuseManager + StreamTransformPipeline) can
 * consume it incrementally. The backend handles FIM templating and auth.
 */
export class RaccoonFimLlm implements ILLM {
  constructor(
    private readonly connectionService: RaccoonConnectionService,
    private readonly directory: string,
    public readonly model: string,
    private readonly hooks: {
      onSuccess?: () => void
      onFailure?: (error: unknown) => void
      log?: (msg: string) => void
    } = {},
  ) {}

  async *streamFim(
    prefix: string,
    suffix: string,
    languageId: string,
    signal: AbortSignal,
  ): AsyncGenerator<string> {
    const client = await this.connectionService.getClientAsync(this.directory)
    const temperature = getAutocompleteModel(this.model).temperature

    let sseError: Error | undefined
    let rawCompletion = ""

    try {
      const { stream } = await client.fim.complete(
        {
          fimRequest: {
            prefix,
            suffix,
            model: this.model,
            language: languageId,
            maxTokens: 1024,
            temperature,
          },
        },
        {
          signal,
          sseMaxRetryAttempts: 1,
          onSseError: (error: unknown) => {
            sseError = error instanceof Error ? error : new Error(String(error))
          },
        },
      )

      for await (const raw of stream) {
        const chunk: FimChunk =
          typeof raw === "string" ? (JSON.parse(raw) as FimChunk) : (raw as unknown as FimChunk)
        if (chunk.type === "delta" && chunk.text) {
          rawCompletion += chunk.text
          yield chunk.text
        }
        if (chunk.type === "error") {
          throw new Error(chunk.message ?? "FIM error")
        }
        if (chunk.type === "done") {
          break
        }
      }

      if (sseError) throw sseError

      this.hooks.log?.(`[raw] model completion (len=${rawCompletion.length}):\n${rawCompletion}\n[/raw]`)
      this.hooks.onSuccess?.()
    } catch (error) {
      if (!signal.aborted) {
        this.hooks.onFailure?.(error)
      }
      throw error
    }
  }
}

/**
 * The backend manages credentials internally, so a connected state means we can
 * issue FIM requests.
 */
export function hasValidCredentials(connectionService: RaccoonConnectionService): boolean {
  return connectionService.getConnectionState() === "connected"
}
