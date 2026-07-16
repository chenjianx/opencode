import { EventEmitter } from "node:events"
import * as fs from "node:fs/promises"
import { readFileSync } from "node:fs"
import * as path from "node:path"
import type {
  Disposable,
  DocumentRangeRef,
  EditorContext,
  Emitter,
  FileSearchResult,
  HostPlatform,
  KeyValueStore,
} from "@opencode-ai/raccoon-core"

// HostPlatform for the IntelliJ sidecar. Editor/file-search/UI surfaces that require the live
// IDE are stubbed for the chat MVP — the orchestrator never calls them during a plain chat turn.
// Phase 2 will route editor.* and ui.* through the Kotlin host over the stdio bridge.
export class SidecarPlatform implements HostPlatform {
  readonly env: HostPlatform["env"]
  readonly workspace: HostPlatform["workspace"]
  readonly settings: HostPlatform["settings"]
  readonly storage: KeyValueStore
  readonly fs: HostPlatform["fs"]
  readonly ui: HostPlatform["ui"]
  readonly editor: HostPlatform["editor"]

  private autocompleteEnabled: boolean
  private readonly autocompleteEmitter = new EventEmitter()

  constructor(opts: {
    directory: string
    locale: string
    autocompleteEnabled: boolean
    storageDir: string
    log: (message: string) => void
  }) {
    this.autocompleteEnabled = opts.autocompleteEnabled
    const storageFile = path.join(opts.storageDir, "raccoon-state.json")

    this.env = { locale: () => opts.locale }
    this.workspace = { directory: () => opts.directory }
    this.settings = {
      getAutocompleteEnabled: () => this.autocompleteEnabled,
      setAutocompleteEnabled: async (enabled: boolean) => {
        if (enabled === this.autocompleteEnabled) return
        this.autocompleteEnabled = enabled
        this.autocompleteEmitter.emit("change", enabled)
      },
      onAutocompleteEnabledChange: (listener) => {
        this.autocompleteEmitter.on("change", listener)
        return { dispose: () => this.autocompleteEmitter.off("change", listener) }
      },
    }
    this.storage = new FileKeyValueStore(storageFile, opts.log)
    this.fs = {
      writeTempFile: async (relativeParts: string[], data: Uint8Array) => {
        const target = path.join(opts.storageDir, "tmp", ...relativeParts)
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, data)
        return target
      },
    }
    this.ui = {
      // Webview reveal/open/external flows are host-driven; for the chat MVP they are best-effort
      // no-ops logged to stderr. Phase 2 routes these to Kotlin over the bridge.
      revealChat: async () => {},
      openFile: (_filePath: string, _directory: string, _line?: number, _column?: number) => {},
      openPath: async () => {},
      openExternal: async (url: string) => opts.log(`openExternal (unhandled in MVP): ${url}`),
      promptInput: async () => undefined,
      saveFile: async () => false,
      showInfo: (message: string) => opts.log(message),
      log: opts.log,
    }
    this.editor = {
      getActiveContext: (): EditorContext | undefined => undefined,
      getRangeContext: async (_ref: DocumentRangeRef): Promise<EditorContext | undefined> => undefined,
      searchFiles: async (): Promise<FileSearchResult> => ({ workspaceDir: opts.directory, items: [] }),
      terminalContext: async () => "",
      gitChangesContext: async () => "",
    }
  }

  createEmitter<T>(): Emitter<T> {
    const emitter = new EventEmitter()
    return {
      event: (listener: (value: T) => void): Disposable => {
        emitter.on("fire", listener)
        return { dispose: () => emitter.off("fire", listener) }
      },
      fire: (value: T) => emitter.emit("fire", value),
      dispose: () => emitter.removeAllListeners(),
    }
  }
}

// KeyValueStore backed by a JSON file, mirroring vscode.Memento semantics closely enough
// for the orchestrator's persisted state (selected model, language mode, etc.).
class FileKeyValueStore implements KeyValueStore {
  private cache: Record<string, unknown>

  constructor(
    private readonly file: string,
    private readonly log: (message: string) => void,
  ) {
    this.cache = readJsonSync(file)
  }

  get<T>(key: string): T | undefined
  get<T>(key: string, defaultValue: T): T
  get<T>(key: string, defaultValue?: T): T | undefined {
    const value = this.cache[key]
    return (value === undefined ? defaultValue : value) as T | undefined
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) delete this.cache[key]
    else this.cache[key] = value
    try {
      await fs.mkdir(path.dirname(this.file), { recursive: true })
      await fs.writeFile(this.file, JSON.stringify(this.cache, null, 2))
    } catch (error) {
      this.log(`failed to persist state: ${String(error)}`)
    }
  }
}

function readJsonSync(file: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>
  } catch {
    return {}
  }
}
