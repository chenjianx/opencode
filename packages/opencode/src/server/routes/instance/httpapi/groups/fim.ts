import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"

export const FimPaths = {
  complete: "/fim",
} as const

/**
 * Fill-in-the-middle completion request. `prefix` is the text before the cursor,
 * `suffix` the text after. The backend completion model fills the gap.
 */
export const FimRequest = Schema.Struct({
  prefix: Schema.String,
  suffix: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  language: Schema.optional(Schema.String),
  maxTokens: Schema.optional(Schema.Number),
  temperature: Schema.optional(Schema.Number),
}).annotate({ identifier: "FimRequest" })
export type FimRequest = typeof FimRequest.Type

export const FimApi = HttpApi.make("fim").add(
  HttpApiGroup.make("fim")
    .add(
      HttpApiEndpoint.post("complete", FimPaths.complete, {
        query: WorkspaceRoutingQuery,
        payload: FimRequest,
        success: Schema.String.pipe(HttpApiSchema.asText({ contentType: "text/event-stream" })),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "fim.complete",
          summary: "Inline FIM completion",
          description: "Stream a fill-in-the-middle text completion for inline autocomplete.",
        }),
      ),
    )
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization)
    .annotateMerge(OpenApi.annotations({ title: "fim", description: "Inline completion route." })),
)
