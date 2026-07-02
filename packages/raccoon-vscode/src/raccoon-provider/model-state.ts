import * as fs from "node:fs/promises"
import path from "node:path"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import type { ChatMode } from "@opencode-ai/raccoon-webview"

export type ModelSelection = {
  providerID: string
  modelID: string
}

export type ModelState = {
  selected?: ModelSelection
  model: Partial<Record<ChatMode, ModelSelection>>
}

export function modelKey(model: { providerID: string; modelID: string }) {
  return `${model.providerID}/${model.modelID}`
}

export function modelSelection(value: unknown): ModelSelection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  const record = value as Record<string, unknown>
  if (typeof record.providerID !== "string" || typeof record.modelID !== "string") return
  return { providerID: record.providerID, modelID: record.modelID }
}

export function modeModelSelections(value: unknown): Partial<Record<ChatMode, ModelSelection>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
      if (key !== "build" && key !== "plan") return []
      const model = modelSelection(item)
      if (!model) return []
      return [[key, model] as const]
    }),
  )
}

function modelState(value: Record<string, unknown>): ModelState {
  const legacy = modeModelSelections(value.model)
  return {
    selected: modelSelection(value.selected) ?? (value.model && !Array.isArray(value.model) ? modelSelection((value.model as Record<string, unknown>).selected) : undefined),
    model: Object.keys(legacy).length > 0 ? legacy : modeModelSelections((value.model as Record<string, unknown>)?.model),
  }
}

export class ModelStateStore {
  private path?: string
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly directory: () => string) {}

  async read(client: OpencodeClient) {
    const file = await this.file(client)
    if (!file) return {}
    try {
      const value = JSON.parse(await fs.readFile(file, "utf-8"))
      if (!value || typeof value !== "object" || Array.isArray(value)) return {}
      return value as Record<string, unknown>
    } catch {
      return {}
    }
  }

  async load(client: OpencodeClient, fallback: ModelState): Promise<ModelState> {
    const data = await this.read(client)
    const state = modelState(data)
    if (state.selected || Object.keys(state.model).length > 0 || (!fallback.selected && Object.keys(fallback.model).length === 0)) return state
    await this.write(client, fallback)
    return fallback
  }

  async write(client: OpencodeClient, state: ModelState) {
    const next = this.queue.then(async () => {
      const file = await this.file(client)
      if (!file) return
      const data = await this.read(client)
      data.selected = state.selected
      data.model = state.model
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, JSON.stringify(data, null, 2))
    })
    this.queue = next.catch(() => {})
    await next
  }

  private async file(client: OpencodeClient) {
    if (this.path) return this.path
    const response = await client.path.get({ directory: this.directory() }, { throwOnError: true })
    if (!response.data.state) return
    this.path = path.join(response.data.state, "model.json")
    return this.path
  }
}
