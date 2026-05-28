import type { LanguageModelV3 } from "@ai-sdk/provider"
import { type FetchFunction, withoutTrailingSlash } from "@ai-sdk/provider-utils"
import { OpenAICompatibleChatLanguageModel } from "../github-copilot/chat/openai-compatible-chat-language-model"

type RaccoonProviderSettings = {
  apiKey?: string
  baseURL?: string
  name?: string
  headers?: Record<string, string>
  fetch?: FetchFunction
}

type RaccoonProvider = {
  (modelId: string): LanguageModelV3
  chat(modelId: string): LanguageModelV3
  responses(modelId: string): LanguageModelV3
  languageModel(modelId: string): LanguageModelV3
}

function raccoonPath(path: string) {
  if (path === "/chat/completions") return "/api/plugin/org/llm/v2/chat-completions"
  if (path === "/completions") return "/api/plugin/org/llm/v2/completions"
  return path
}

function raccoonBaseURL(baseURL: string | undefined) {
  return baseURL?.replace(/\/api\/plugin\/(?:org\/)?llm\/v\d+\/?$/, "")
}

export function createRaccoonProvider(options: RaccoonProviderSettings = {}): RaccoonProvider {
  const baseURL = raccoonBaseURL(withoutTrailingSlash(options.baseURL ?? "http://10.4.196.193:5580"))
  if (!baseURL) throw new Error("baseURL is required")

  const headers = {
    ...(options.apiKey && { Authorization: `Bearer ${options.apiKey}` }),
    ...options.headers,
  }
  const createChatModel = (modelId: string) =>
    new OpenAICompatibleChatLanguageModel(modelId, {
      provider: `${options.name ?? "raccoon"}.chat`,
      headers: () => headers,
      url: ({ path }) => `${baseURL}${raccoonPath(path)}`,
      fetch: options.fetch,
    })

  const provider = function (modelId: string) {
    return createChatModel(modelId)
  }

  provider.languageModel = createChatModel
  provider.chat = createChatModel
  provider.responses = createChatModel

  return provider as RaccoonProvider
}
