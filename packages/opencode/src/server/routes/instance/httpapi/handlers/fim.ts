import { Provider } from "@/provider/provider"
import { ProviderV2 } from "@opencode-ai/core/provider"
import * as Log from "@opencode-ai/core/util/log"
import { Effect, Schema, Stream } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import * as Sse from "effect/unstable/encoding/Sse"
import { FimRequest } from "../groups/fim"
import { InstanceHttpApi } from "../api"

const log = Log.create({ service: "fim" })

const RACCOON_PROVIDER_ID = "raccoon"
const DEFAULT_COMPLETION_MODEL = "raccoon-pro-completion"
const DEFAULT_MAX_TOKENS = 1024
// Low temperature keeps inline completions deterministic — the same cursor
// position yields the same best completion instead of flickering between
// candidates. Continue uses 0.01 for autocomplete.
const DEFAULT_TEMPERATURE = 0.01

// The raccoon completion endpoint expects a structured `input` payload
// (prefix/suffix/language_id) and applies its own FIM template server-side.
// Standard model ids are sent as `model: undefined` (the gateway infers it).
const STANDARD_MODELS = new Set([
  "raccoon-chat",
  "raccoon-completion",
  "raccoon-pro-chat",
  "raccoon-pro-completion",
])

/** One SSE frame sent to the extension. */
type FimChunk =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string }

function chunkData(chunk: FimChunk): Sse.Event {
  return {
    _tag: "Event",
    event: "message",
    id: undefined,
    data: JSON.stringify(chunk),
  }
}

/**
 * Extract the text delta out of one parsed upstream SSE JSON payload.
 *
 * The raccoon completion endpoint follows OpenAI text-completion shape
 * (`choices[0].text`), but may also wrap the payload in `{ data: {...} }` and
 * emit heartbeat / status frames. Parse defensively and tolerate both shapes.
 *
 * Returns the text delta, or `null` to skip the frame (heartbeat/empty), or
 * throws via the `error` field surfaced to the caller.
 */
function parseUpstreamFrame(raw: string): { text?: string; done?: boolean; error?: string } {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  if (trimmed === "[DONE]") return { done: true }

  let json: any
  try {
    json = JSON.parse(trimmed)
  } catch {
    return {}
  }

  // Unwrap a possible `{ data: {...} }` envelope.
  const payload = json?.data && typeof json.data === "object" ? json.data : json

  if (payload?.is_heartbeat) return {}

  // Surface explicit error status codes (raccoon uses `status.code != 0`).
  const status = payload?.status
  if (status && typeof status.code === "number" && status.code !== 0) {
    return { error: status.message ?? `upstream status ${status.code}` }
  }

  const choice = payload?.choices?.[0]
  if (!choice) return {}
  // The raccoon completion endpoint puts the text delta in `choices[0].delta`
  // as a plain string; chat-style responses use `delta.content` or `text`.
  const extract = (c: any): string | undefined =>
    typeof c?.delta === "string" ? c.delta : (c?.delta?.content ?? c?.text ?? undefined)
  if (choice.finish_reason) return { text: extract(choice), done: true }
  const text = extract(choice)
  return typeof text === "string" ? { text } : {}
}

/**
 * Read a `text/event-stream` Response body and yield decoded `FimChunk`s.
 * Splits on `\n\n` frame boundaries and strips the leading `data:` prefix.
 */
async function* readUpstream(response: Response): AsyncGenerator<FimChunk> {
  if (!response.ok) {
    yield { type: "error", message: `upstream ${response.status}` }
    return
  }
  if (!response.body) {
    yield { type: "done" }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let boundary: number
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)

        for (const line of frame.split("\n")) {
          const data = line.startsWith("data:") ? line.slice(5) : line.startsWith("data") ? line.slice(4) : null
          if (data === null) continue
          const parsed = parseUpstreamFrame(data)
          if (parsed.error) {
            yield { type: "error", message: parsed.error }
            return
          }
          if (parsed.text) yield { type: "delta", text: parsed.text }
          if (parsed.done) {
            yield { type: "done" }
            return
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  yield { type: "done" }
}

export const fimHandlers = HttpApiBuilder.group(InstanceHttpApi, "fim", (handlers) =>
  Effect.gen(function* () {
    const provider = yield* Provider.Service

    return handlers.handleRaw(
      "complete",
      Effect.fn("FimHttpApi.complete")(function* (ctx: { request: HttpServerRequest.HttpServerRequest }) {
        const raw = yield* Effect.orDie(ctx.request.text)
        const json = yield* Effect.try({
          try: () => JSON.parse(raw),
          catch: () => new HttpApiError.BadRequest({}),
        })
        const payload = yield* Schema.decodeUnknownEffect(FimRequest)(json).pipe(
          Effect.mapError(() => new HttpApiError.BadRequest({})),
        )
        const modelID = payload.model ?? DEFAULT_COMPLETION_MODEL

        const info = yield* provider.getProvider(ProviderV2.ID.make(RACCOON_PROVIDER_ID))
        const options = (info?.options ?? {}) as Record<string, any>
        const fetchFn: typeof fetch = typeof options.fetch === "function" ? options.fetch : fetch
        const baseURL: string | undefined = typeof options.baseURL === "string" ? options.baseURL : info?.models?.[modelID]?.api?.url

        if (!baseURL) {
          log.warn("raccoon provider not configured for fim")
          const errorChunk: FimChunk = { type: "error", message: "raccoon provider not configured" }
          return HttpServerResponse.stream(
            Stream.make(errorChunk).pipe(
              Stream.map(chunkData),
              Stream.pipeThroughChannel(Sse.encode()),
              Stream.encodeText,
            ),
            { contentType: "text/event-stream" },
          )
        }

        // loader.fetch rewrites `/v1/completions` to the raccoon endpoint and
        // injects auth / x-org-code. We call the OpenAI-style path; the gateway
        // applies the model's FIM template to the structured `input` itself.
        const url = `${baseURL.replace(/\/$/, "")}/v1/completions`
        const body = JSON.stringify({
          model: STANDARD_MODELS.has(modelID) ? undefined : modelID,
          input: {
            language_id: payload.language ?? "unknown",
            prefix: payload.prefix,
            suffix: payload.suffix ?? "",
          },
          n: 1,
          stream: true,
          stop: "<EOT>",
          temperature: payload.temperature ?? DEFAULT_TEMPERATURE,
          max_new_tokens: Math.min(payload.maxTokens ?? DEFAULT_MAX_TOKENS, 1024),
        })

        const upstream = Stream.fromAsyncIterable(
          (async function* () {
            let response: Response
            try {
              response = await fetchFn(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
              })
            } catch (error) {
              yield { type: "error", message: error instanceof Error ? error.message : String(error) } as FimChunk
              return
            }
            yield* readUpstream(response)
          })(),
          (error) => ({ type: "error", message: String(error) }) as FimChunk,
        )

        return HttpServerResponse.stream(
          upstream.pipe(
            Stream.map(chunkData),
            Stream.pipeThroughChannel(Sse.encode()),
            Stream.encodeText,
          ),
          {
            contentType: "text/event-stream",
            headers: {
              "Cache-Control": "no-cache, no-transform",
              "X-Accel-Buffering": "no",
              "X-Content-Type-Options": "nosniff",
            },
          },
        )
      }),
    )
  }),
)
