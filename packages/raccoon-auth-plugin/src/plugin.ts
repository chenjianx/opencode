import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import type { Model, Provider } from "@opencode-ai/sdk/v2"
import open from "open"
import * as Log from "@opencode-ai/core/util/log"
import { createServer, type Server } from "node:http"

const log = Log.create({ service: "raccoon.auth" })
const DEFAULT_BASE_URL = "http://10.4.196.193:5580"
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_CONTEXT_LENGTH = 64_000
const DEFAULT_INPUT_LENGTH = 60_000
const STANDARD_MODELS = new Set(["raccoon-chat", "raccoon-completion", "raccoon-pro-chat", "raccoon-pro-completion"])

type TokenResponse = {
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

type LoginResult = {
  access: string
  refresh: string
}

type UserInfoResponse = {
  data?: {
    id?: string
    email?: string
    name?: string
    pro?: boolean
    orgs?: Array<{ id?: string; code?: string; name: string; pro_code_enabled?: boolean }>
  }
}

type ServerSettingsResponse = {
  data?: {
    settings?: {
      capabilities?: string[]
    }
  }
}

type ProfileModel = {
  name?: string
  model?: string
  apiPath?: string
  apiBase?: string
  roles?: string[]
  capabilities?: string[]
  defaultCompletionOptions?: {
    contextLength?: number
    maxTokens?: number
  }
  orgScopeId?: string
}

type ProfilesResponse = {
  data?: {
    config?: {
      models?: ProfileModel[]
    }
  }
}

type RaccoonTool = {
  type?: string
  function?: {
    name?: string
    description?: string
    parameters?: unknown
  }
}

type RaccoonMessage = {
  role?: string
  content?: unknown
}

type RaccoonRequestBody = {
  messages?: RaccoonMessage[]
  model?: string
  max_tokens?: number
  max_new_tokens?: number
  temperature?: number
  top_p?: number
  frequency_penalty?: number
  presence_penalty?: number
  stream?: boolean
  stop?: string | string[]
  tools?: RaccoonTool[]
}

function summarizeRequestBody(body: RaccoonRequestBody) {
  return {
    keys: Object.keys(body),
    model: body.model,
    hasMaxTokens: body.max_tokens !== undefined,
    hasMaxNewTokens: body.max_new_tokens !== undefined,
    stream: body.stream,
    toolChoice: "tool_choice" in body,
    toolCount: body.tools?.length ?? 0,
    toolNames: body.tools?.map((tool) => tool.function?.name),
    messageRoles: body.messages?.map((message) => message.role),
    hasOrgScopeId: "orgScopeId" in body,
  }
}

function normalizeMessageContent(message: RaccoonMessage) {
  if (!Array.isArray(message.content)) return message
  return {
    ...message,
    content: message.content
      .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text) : ""))
      .filter(Boolean)
      .join("\n"),
  }
}

async function probeInvalidArguments(url: URL, init: RequestInit, body: RaccoonRequestBody) {
  if (process.env.RACCOON_DEBUG_INVALID_ARGS !== "1") return

  const cases = [
    { name: "without_orgScopeId", body: { ...body, orgScopeId: undefined } },
    { name: "without_tools", body: { ...body, tools: undefined, tool_choice: undefined } },
    { name: "without_tool_choice", body: { ...body, tool_choice: undefined } },
    { name: "without_response_format", body: { ...body, response_format: undefined } },
    { name: "without_max_tokens", body: { ...body, max_tokens: undefined } },
    { name: "without_model", body: { ...body, model: undefined } },
  ]

  for (const item of cases) {
    const response = await fetch(url, {
      ...init,
      body: JSON.stringify(item.body),
    }).catch((error) => {
      log.warn("raccoon invalid args probe failed", { name: item.name, error })
      return undefined
    })
    if (!response) continue
    log.info("raccoon invalid args probe", {
      name: item.name,
      status: response.status,
      ok: response.ok,
      summary: summarizeRequestBody(item.body),
    })
    await response.body?.cancel().catch(() => undefined)
  }
}

function baseUrlFromEnv() {
  const url = process.env.RACCOON_API_URL ?? process.env.RACCOON_BASE_URL ?? DEFAULT_BASE_URL
  return url.replace(/\/+$/, "")
}

function randomString(length: number) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes)
    .map((byte) => chars[byte % chars.length])
    .join("")
}

function authorizeUrl(baseUrl: string, redirectUri: string) {
  const params = new URLSearchParams({
    ide: "CLI",
    appname: "OpenCode",
    redirect: redirectUri,
  })
  return `${baseUrl}/login?${params.toString()}`
}

function jsonError(json: TokenResponse, fallback: string) {
  return json.error?.message || json.message || json.details || fallback
}

function normalizeUrl(input: string) {
  return input.replace(/\/+$/, "")
}

function parseJwtExp(token: string) {
  const parts = token.split(".")
  if (parts.length !== 3) return undefined

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as { exp?: number }
    return payload.exp
  } catch {
    return undefined
  }
}

function tokenResult(json: TokenResponse): LoginResult {
  const access = json.data?.access_token
  const refresh = json.data?.refresh_token
  if (!access || !refresh) throw new Error("Login failed: missing tokens")
  return { access, refresh }
}

async function exchangeCode(baseUrl: string, code: string) {
  const response = await fetch(`${baseUrl}/api/plugin/auth/v1/login_with_authorization_code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authorization_code: code }),
  })
  const json = (await response.json().catch(() => ({}))) as TokenResponse
  if (!response.ok) throw new Error(jsonError(json, `Login failed: ${response.status}`))

  return tokenResult(json)
}

async function refreshAccessToken(baseUrl: string, refreshToken: string) {
  const response = await fetch(`${baseUrl}/api/plugin/auth/v1/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  const json = (await response.json().catch(() => ({}))) as TokenResponse
  if (!response.ok) throw new Error(jsonError(json, `Token refresh failed: ${response.status}`))

  return tokenResult(json)
}

async function fetchUserInfo(baseUrl: string, access: string) {
  const response = await fetch(`${baseUrl}/api/plugin/auth/v1/user_info`, {
    headers: { Authorization: `Bearer ${access}` },
  })
  const json = (await response.json().catch(() => ({}))) as UserInfoResponse
  if (!response.ok) throw new Error(`Failed to fetch user info: ${response.status}`)
  return json.data
}

function accountIdFromUser(user: UserInfoResponse["data"]) {
  return user?.orgs?.[0]?.code ?? user?.orgs?.[0]?.id ?? user?.id
}

async function getAccess(getAuth: () => Promise<any>, input: PluginInput, baseUrl: string) {
  const auth = await getAuth()
  if (auth.type !== "oauth") return

  const loginBaseUrl = auth.enterpriseUrl ?? baseUrl
  if (auth.expires > Date.now()) {
    log.info("resolving raccoon account id", {
      source: auth.accountId ? "auth" : "user_info",
      hasAuthAccountId: Boolean(auth.accountId),
      baseUrl: loginBaseUrl,
    })
    const accountId =
      auth.accountId ??
      accountIdFromUser(
        await fetchUserInfo(loginBaseUrl, auth.access).catch((error) => {
          log.warn("failed to recover raccoon account id", { error })
          return undefined
        }),
      )
    if (accountId && !auth.accountId) {
      log.info("persisting recovered raccoon account id", {
        accountId,
      })
      await input.client.auth.set({
        path: { id: "raccoon" },
        body: {
          type: "oauth",
          refresh: auth.refresh,
          access: auth.access,
          expires: auth.expires,
          enterpriseUrl: loginBaseUrl,
          ...(accountId && { accountId: accountId as string }),
        },
      })
    }
    log.info("using cached raccoon access token", {
      expiresAt: new Date(auth.expires).toISOString(),
      hasAccountId: Boolean(accountId),
      accountId,
    })
    return {
      access: auth.access as string,
      enterpriseUrl: loginBaseUrl,
      accountId: accountId as string | undefined,
    }
  }

  log.info("refreshing raccoon access token", {
    expiresAt: new Date(auth.expires).toISOString(),
    hasAccountId: Boolean(auth.accountId),
  })
  const refreshed = await refreshAccessToken(loginBaseUrl, auth.refresh)
  const accountId =
    auth.accountId ??
    accountIdFromUser(
      await fetchUserInfo(loginBaseUrl, refreshed.access).catch((error) => {
        log.warn("failed to recover raccoon account id after refresh", { error })
        return undefined
      }),
    )
  log.info("resolved raccoon account id after refresh", {
    hasAccountId: Boolean(accountId),
    accountId,
  })
  await input.client.auth.set({
    path: { id: "raccoon" },
    body: {
      type: "oauth",
      refresh: refreshed.refresh,
      access: refreshed.access,
      expires: (parseJwtExp(refreshed.access) ?? Math.floor(Date.now() / 1000) + 3600) * 1000,
      enterpriseUrl: loginBaseUrl,
      ...(accountId && { accountId: accountId as string }),
    },
  })

  return {
    access: refreshed.access,
    enterpriseUrl: loginBaseUrl,
    accountId: accountId as string | undefined,
  }
}

function modelTemplate(input: {
  id: string
  name: string
  baseUrl: string
  contextLength: number
  toolcall?: boolean
  orgScopeId?: string
}): Model {
  return {
    id: input.id,
    providerID: "raccoon",
    name: input.name,
    api: {
      id: input.id,
      url: input.baseUrl,
      npm: "@opencode-ai/raccoon-provider",
    },
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: false,
      toolcall: input.toolcall ?? true,
      input: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      output: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      interleaved: false,
    },
    cost: {
      input: 0,
      output: 0,
      cache: { read: 0, write: 0 },
    },
    limit: {
      context: input.contextLength,
      input: Math.max(0, Math.min(input.contextLength - 4096, DEFAULT_INPUT_LENGTH)),
      output: 4096,
    },
    status: "active",
    options: {
      ...(input.orgScopeId ? { orgScopeId: input.orgScopeId } : {}),
    },
    headers: {},
    release_date: "",
  }
}

function fallbackModels(baseUrl: string, pro?: boolean, orgScopeId?: string): Record<string, Model> {
  const chat = orgScopeId || pro ? "raccoon-pro-chat" : "raccoon-chat"
  const completion = orgScopeId || pro ? "raccoon-pro-completion" : "raccoon-completion"

  return {
    [chat]: modelTemplate({
      id: chat,
      name: orgScopeId || pro ? "Raccoon Pro" : "Raccoon",
      baseUrl,
      contextLength: DEFAULT_CONTEXT_LENGTH,
      orgScopeId,
    }),
    [completion]: modelTemplate({
      id: completion,
      name: orgScopeId || pro ? "Raccoon Complete Pro" : "Raccoon Complete",
      baseUrl,
      contextLength: DEFAULT_CONTEXT_LENGTH,
      orgScopeId,
    }),
  }
}

function fromProfileModel(baseUrl: string, model: ProfileModel): Model | undefined {
  if (!model.model) return

  return modelTemplate({
    id: model.model,
    name: model.name ?? model.model,
    baseUrl: model.apiBase ? normalizeUrl(model.apiBase) : baseUrl,
    contextLength: model.defaultCompletionOptions?.contextLength ?? DEFAULT_CONTEXT_LENGTH,
    toolcall: model.capabilities?.includes("tool_use") || model.roles?.some((role) => role !== "autocomplete"),
    orgScopeId: model.orgScopeId,
  })
}

async function fetchServerProfileModels(baseUrl: string, access: string, orgCode?: string) {
  const settingsResponse = await fetch(`${baseUrl}/api/plugin/setting/v1/settings`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${access}`,
    },
  })
  const settings = (await settingsResponse.json().catch(() => ({}))) as ServerSettingsResponse
  if (!settings.data?.settings?.capabilities?.includes("chatv2")) return

  const response = await fetch(
    `${baseUrl}${orgCode ? "/api/plugin/org/setting/v1/profiles" : "/api/plugin/setting/v1/profiles"}`,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access}`,
        ...(orgCode ? { "x-org-code": orgCode } : {}),
      },
    },
  )
  const json = (await response.json().catch(() => ({}))) as ProfilesResponse
  if (!response.ok) throw new Error(`Failed to fetch Raccoon profiles: ${response.status}`)

  return Object.fromEntries(
    (json.data?.config?.models ?? [])
      .map((model) => fromProfileModel(baseUrl, { ...model, orgScopeId: model.orgScopeId ?? orgCode }))
      .filter((model): model is Model => Boolean(model))
      .map((model) => [model.id, model]),
  )
}

async function fetchPersonalProfileModels(baseUrl: string, access: string) {
  const response = await fetch(`${baseUrl}/api/plugin/setting/v1/profiles`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${access}`,
    },
  })
  const json = (await response.json().catch(() => ({}))) as ProfilesResponse
  if (!response.ok) throw new Error(`Failed to fetch Raccoon profiles: ${response.status}`)

  return Object.fromEntries(
    (json.data?.config?.models ?? [])
      .map((model) => fromProfileModel(baseUrl, model))
      .filter((model): model is Model => Boolean(model))
      .map((model) => [model.id, model]),
  )
}

function rewriteRaccoonRequest(baseUrl: string, orgCode: string | undefined, requestInput: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(
    requestInput instanceof URL ? requestInput.href : typeof requestInput === "string" ? requestInput : requestInput.url,
  )
  const root = new URL(baseUrl)

  if (url.pathname.endsWith("/chat/completions"))
    url.pathname = url.pathname.replace(
      /\/chat\/completions$/,
      orgCode ? "/api/plugin/org/llm/v2/chat-completions" : "/api/plugin/llm/v2/chat-completions",
    )
  if (url.pathname.endsWith("/chat-completions"))
    url.pathname = url.pathname.replace(
      /(?:\/api\/plugin\/(?:org\/)?llm\/v\d+)?\/chat-completions$/,
      orgCode ? "/api/plugin/org/llm/v2/chat-completions" : "/api/plugin/llm/v2/chat-completions",
    )
  if (url.pathname.endsWith("/v1/completions"))
    url.pathname = url.pathname.replace(
      /\/v1\/completions$/,
      orgCode ? "/api/plugin/org/llm/v2/completions" : "/api/plugin/llm/v2/completions",
    )
  if (url.origin !== root.origin) {
    url.protocol = root.protocol
    url.host = root.host
  }

  const body = typeof init?.body === "string" ? (JSON.parse(init.body) as RaccoonRequestBody) : undefined
  return {
    url,
    init: body
      ? {
          ...init,
          body: JSON.stringify({
            ...body,
            messages: body.messages?.map(normalizeMessageContent),
            model: body.model && STANDARD_MODELS.has(body.model) ? undefined : body.model,
            max_new_tokens: body.max_new_tokens ?? body.max_tokens,
          }),
        }
      : init,
  }
}

function normalizeRaccoonResponse(response: Response) {
  if (!response.body) return response
  if (!response.headers.get("content-type")?.includes("text/event-stream")) return response

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let pending = ""

  function normalizeToolArguments(toolCall: {
    function?: {
      name?: string
      arguments?: string
    }
  }) {
    if (toolCall.function?.name !== "bash") return
    if (!toolCall.function.arguments) return

    try {
      const args = JSON.parse(toolCall.function.arguments) as {
        command?: string
        description?: string
      }
      if (!args.command || args.description) return
      toolCall.function.arguments = JSON.stringify({
        ...args,
        description: args.command.split(/\s+/).slice(0, 6).join(" "),
      })
    } catch {
      return
    }
  }

  function normalizeLine(line: string) {
    if (!line.startsWith("data:")) return line
    const data = line.slice(5).trimStart()
    if (!data || data === "[DONE]") return line

    try {
      const json = JSON.parse(data) as {
        data?: {
        choices?: Array<{
          role?: string
          delta?:
            | string
            | {
                role?: string
                content?: string
                reasoning_content?: string
                tool_calls?: Array<{
                  function?: {
                    name?: string
                    arguments?: string
                  }
                }>
              }
          finish_reason?: string | null
        }>
      }
      is_heartbeat?: boolean
      choices?: Array<{
        role?: string
        delta?:
          | string
          | {
              role?: string
              content?: string
              reasoning_content?: string
              tool_calls?: Array<{
                function?: {
                  name?: string
                  arguments?: string
                }
              }>
            }
        finish_reason?: string | null
      }> | null
      }
      if (json.is_heartbeat) return undefined
      const normalized = json.data ?? json
      for (const choice of normalized.choices ?? []) {
        if (typeof choice.delta === "string") {
          choice.delta = { ...(choice.role ? { role: choice.role } : {}), content: choice.delta }
          delete choice.role
        }
        if (choice.delta?.role === "") delete choice.delta.role
        for (const toolCall of choice.delta?.tool_calls ?? []) {
          normalizeToolArguments(toolCall)
        }
        if (choice.finish_reason === "") choice.finish_reason = null
      }
      return `data: ${JSON.stringify(normalized)}`
    } catch {
      return line
    }
  }

  const body = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      const part = await reader.read()
      if (part.done) {
        const normalized = pending ? normalizeLine(pending) : ""
        if (normalized) ctrl.enqueue(encoder.encode(normalized))
        ctrl.close()
        return
      }

      const lines = (pending + decoder.decode(part.value, { stream: true })).split(/\r?\n/)
      pending = lines.pop() ?? ""
      const normalized = lines
        .map(normalizeLine)
        .filter((line) => line !== undefined)
        .join("\n")
      if (normalized) ctrl.enqueue(encoder.encode(normalized + "\n"))
    },
    async cancel(reason) {
      await reader.cancel(reason)
    },
  })

  return new Response(body, {
    headers: new Headers(response.headers),
    status: response.status,
    statusText: response.statusText,
  })
}

function startCallbackServer() {
  let server: Server | undefined
  let port = 0
  let onCallback: ((url: URL) => Promise<void>) | undefined

  const ready = new Promise<string>((resolve, reject) => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`)
      if (url.pathname !== "/auth/callback") {
        res.writeHead(404)
        res.end("Not found")
        return
      }

      void (async () => {
        try {
          await onCallback?.(url)
          res.writeHead(200, { "Content-Type": "text/html" })
          res.end("<!doctype html><html><body><h1>Authorization Successful</h1><p>You can close this window and return to OpenCode.</p></body></html>")
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          res.writeHead(400, { "Content-Type": "text/html" })
          res.end(
            `<!doctype html><html><body><h1>Authorization Failed</h1><p>${message}</p></body></html>`,
          )
        }
      })()
    })
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server?.address()
      if (!address || typeof address === "string") {
        reject(new Error("Failed to start callback server"))
        return
      }
      port = address.port
      resolve(`http://127.0.0.1:${port}/auth/callback`)
    })
  })

  return {
    ready,
    onCallback(callback: (url: URL) => Promise<void>) {
      onCallback = callback
    },
    stop() {
      server?.close()
    },
  }
}

export async function RaccoonAuthPlugin(_input: PluginInput): Promise<Hooks> {
  const baseUrl = baseUrlFromEnv()

  return {
    async config(config) {
      config.provider = {
        ...config.provider,
        raccoon: {
          name: "Raccoon",
          api: baseUrl,
          models: {
            "raccoon-chat": {
              name: "Raccoon",
              provider: {
                npm: "@opencode-ai/raccoon-provider",
              },
              limit: {
                context: DEFAULT_CONTEXT_LENGTH,
                input: DEFAULT_INPUT_LENGTH,
                output: 4096,
              } as { context: number; input: number; output: number },
            },
          },
          ...config.provider?.raccoon,
        },
      }
    },
    provider: {
      id: "raccoon",
      async models(provider: Provider, ctx) {
        if (ctx.auth?.type !== "oauth") {
          return Object.fromEntries(
            Object.entries(provider.models).map(([id, model]) => [
              id,
              {
                ...model,
                api: {
                  ...model.api,
                  url: baseUrl,
                },
              },
            ]),
          )
        }

        const loginBaseUrl = normalizeUrl(ctx.auth.enterpriseUrl ?? baseUrl)
        const user = await fetchUserInfo(loginBaseUrl, ctx.auth.access).catch(() => undefined)
        const authWithAccount = ctx.auth as typeof ctx.auth & { accountId?: string }
        const accountId = authWithAccount.accountId ?? accountIdFromUser(user)
        const serverModels = await fetchServerProfileModels(loginBaseUrl, ctx.auth.access, accountId).catch((error) => {
          log.warn("failed to fetch raccoon profiles", { error })
          return undefined
        })

        return Object.keys(serverModels ?? {}).length
          ? serverModels!
          : fallbackModels(loginBaseUrl, user?.pro || user?.orgs?.some((org) => org.pro_code_enabled), accountId)
      },
    },
    auth: {
      provider: "raccoon",
      async loader(getAuth) {
        const auth = await getAuth()
        if (auth.type !== "oauth") return {}

        return {
          apiKey: "opencode-oauth-dummy-key",
          baseURL: auth.enterpriseUrl ? normalizeUrl(auth.enterpriseUrl) : baseUrl,
          async fetch(requestInput: RequestInfo | URL, init?: RequestInit) {
            const current = await getAccess(getAuth, _input, baseUrl)
            if (!current) return fetch(requestInput, init)

            const headers = new Headers(init?.headers)
            headers.set("authorization", `Bearer ${current.access}`)
            if (current.accountId) headers.set("x-org-code", current.accountId)

            const request = rewriteRaccoonRequest(current.enterpriseUrl, current.accountId, requestInput, {
              ...init,
              headers,
            })
            const requestBody =
              typeof request.init?.body === "string" ? (JSON.parse(request.init.body) as RaccoonRequestBody) : undefined
            log.info("raccoon api request", {
              path: request.url.pathname,
              hasAccountId: Boolean(current.accountId),
              accountId: current.accountId,
              hasOrgCodeHeader: new Headers(request.init?.headers).has("x-org-code"),
              orgCodeHeader: new Headers(request.init?.headers).get("x-org-code") ?? undefined,
              body: requestBody ? summarizeRequestBody(requestBody) : undefined,
            })
            const baseInit = request.init ?? {}
            const response = await fetch(request.url, baseInit)
            if (response.status === 400 && requestBody) await probeInvalidArguments(request.url, baseInit, requestBody)
            return normalizeRaccoonResponse(response)
          },
        }
      },
      methods: [
        {
          type: "oauth",
          label: "Browser sign-in",
          prompts: [
            {
              type: "text",
              key: "serverUrl",
              message: "Enter Raccoon server URL",
              placeholder: baseUrl,
              validate: (value) => {
                if (!value) return undefined
                try {
                  const url = value.includes("://") ? new URL(value) : new URL(`https://${value}`)
                  return url.hostname ? undefined : "Enter a valid URL"
                } catch {
                  return "Enter a valid URL"
                }
              },
            },
          ],
          async authorize(inputs = {}) {
            const loginBaseUrl = normalizeUrl(inputs.serverUrl || baseUrl)
            const state = randomString(32)
            const callbackServer = startCallbackServer()
            const callbackPromise = new Promise<{
              access: string
              refresh: string
              accountId?: string
              enterpriseUrl?: string
            }>((resolve, reject) => {
              const timeout = setTimeout(() => {
                callbackServer.stop()
                reject(new Error("OAuth callback timeout"))
              }, CALLBACK_TIMEOUT_MS)
              callbackServer.onCallback(async (requestUrl) => {
                try {
                  const returnedState = requestUrl.searchParams.get("state")
                  if (returnedState && returnedState !== state) throw new Error("Invalid OAuth state")
                  const code = requestUrl.searchParams.get("authorization_code") ?? requestUrl.searchParams.get("code")
                  if (!code) throw new Error("Missing authorization code")
                  const tokens = await exchangeCode(loginBaseUrl, code)
                  const user = await fetchUserInfo(loginBaseUrl, tokens.access)
                  const accountId = accountIdFromUser(user)
                  const exp = parseJwtExp(tokens.access)
                  resolve({
                    access: tokens.access,
                    refresh: tokens.refresh,
                    accountId,
                    enterpriseUrl: loginBaseUrl,
                  })
                  log.info("raccoon login completed", {
                    baseUrl: loginBaseUrl,
                    email: user?.email,
                    accountId,
                    expiresAt: exp ? new Date(exp * 1000).toISOString() : undefined,
                  })
                } catch (error) {
                  reject(error instanceof Error ? error : new Error(String(error)))
                } finally {
                  clearTimeout(timeout)
                  callbackServer.stop()
                }
              })
            })

            const redirectUri = `${await callbackServer.ready}?state=${encodeURIComponent(state)}`
            const url = authorizeUrl(loginBaseUrl, redirectUri)
            await open(url).catch(() => undefined)

            return {
              url,
              instructions: `Open ${url} in your browser and complete sign-in.`,
              method: "auto" as const,
              async callback() {
                const result = await callbackPromise
                const expires = parseJwtExp(result.access)
                return {
                  type: "success" as const,
                  provider: "raccoon",
                  refresh: result.refresh,
                  access: result.access,
                  expires: expires ? expires * 1000 : Date.now() + 60 * 60 * 1000,
                  accountId: result.accountId,
                  enterpriseUrl: result.enterpriseUrl,
                }
              },
            }
          },
        },
      ],
    },
  }
}
