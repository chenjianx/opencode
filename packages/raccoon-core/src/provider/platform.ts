import type {
  ExtensionToWebview,
  RaccoonFileSearchItem,
  RaccoonSession,
  RaccoonState,
  WebviewToExtension,
} from "@opencode-ai/raccoon-webview"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"

// The host-platform port. RaccoonProvider (the platform-agnostic orchestrator) talks
// only to this interface, never to `vscode` directly. The VSCode extension supplies a
// `VscodeHostPlatform`; a future JetBrains plugin would supply an RPC-backed one.

export interface Disposable {
  dispose(): void
}

export interface Emitter<T> {
  event(listener: (value: T) => void): Disposable
  fire(value: T): void
  dispose(): void
}

// Structurally satisfied by vscode.Memento, so `context.globalState` can be passed directly.
export interface KeyValueStore {
  get<T>(key: string): T | undefined
  get<T>(key: string, defaultValue: T): T
  update(key: string, value: unknown): PromiseLike<void>
}

export type RaccoonWebviewSource = "chat" | "settings"

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error"

export type ServerConfig = {
  baseUrl: string
  headers?: Record<string, string>
  port?: number
}

// The backend launcher port. The orchestrator only consumes these four members; the concrete
// implementation (spawning the opencode CLI server) is platform-specific and stays in the host.
export interface ConnectionPort {
  onStateChange(listener: (state: ConnectionState) => void): () => void
  getServerConfig(): ServerConfig | null
  getClientAsync(directory: string): Promise<OpencodeClient>
}

// The two webview surfaces (sidebar chat + standalone settings panel). Implemented by the
// platform's webview container; the orchestrator only posts protocol messages through it.
export interface WebviewTransport {
  // Registers the orchestrator's handler for messages arriving from either webview surface.
  onMessage(handler: (message: WebviewToExtension, source: RaccoonWebviewSource) => void): void
  openSettings(): void
  closeSettings(): void
  markReady(source: RaccoonWebviewSource): void
  post(source: RaccoonWebviewSource, message: ExtensionToWebview): void
  postState(state: RaccoonState): void
  postSession(session: RaccoonSession): void
  postError(message: string): void
  postRaccoonLoginFinished(): void
  postCustomProviderSaved(providerID: string): void
}

export type EditorContextAction = "EXPLAIN" | "FIX" | "IMPROVE" | "REFACTOR" | "COMMENT" | "ADD_TO_CONTEXT"

export type EditorDiagnostic = {
  source?: string
  message: string
}

export type EditorContext = {
  filePath: string
  selectedText: string
  startLine: number
  endLine: number
  diagnostics: EditorDiagnostic[]
}

// Neutral reference to a document range, so the orchestrator can request context without
// touching vscode.Uri / vscode.Range. Line/column are 0-based to mirror the editor APIs.
export type DocumentRangeRef = {
  uri: string
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

export type FileSearchResult = {
  workspaceDir: string
  items: RaccoonFileSearchItem[]
}

export interface HostPlatform {
  env: {
    locale(): string
  }
  workspace: {
    directory(): string
  }
  settings: {
    getAutocompleteEnabled(): boolean
    setAutocompleteEnabled(enabled: boolean): Promise<void>
    onAutocompleteEnabledChange(listener: (enabled: boolean) => void): Disposable
  }
  storage?: KeyValueStore
  fs: {
    // Writes a temp file under the host's storage dir and returns an absolute path to open.
    writeTempFile(relativeParts: string[], data: Uint8Array): Promise<string>
  }
  ui: {
    revealChat(): Promise<void>
    // Opens a file by its (possibly workspace-relative) path. The host resolves it against
    // `directory`, checks existence, and falls back to a recursive basename search when the
    // resolved path does not exist — so callers can pass bare filenames or partial paths.
    openFile(filePath: string, directory: string, line?: number, column?: number): void
    // Opens an already-materialized file/image by absolute path or file:// URL.
    openPath(target: string): Promise<void>
    // Opens a URL in the host's external browser (OAuth flows).
    openExternal(url: string): Promise<void>
    // Prompts the user for a single line of text (e.g. an OAuth code). Returns undefined if dismissed.
    promptInput(options: { title: string; prompt?: string }): Promise<string | undefined>
    // Shows a save dialog and writes `data` to the chosen location. Returns false if cancelled.
    saveFile(options: {
      title: string
      saveLabel?: string
      defaultName: string
      directory: string
      filters?: Record<string, string[]>
      data: Uint8Array
    }): Promise<boolean>
    // Shows a transient confirmation (toast) after a successful action.
    showInfo(message: string): void
    log(message: string): void
  }
  editor: {
    getActiveContext(): EditorContext | undefined
    getRangeContext(ref: DocumentRangeRef): Promise<EditorContext | undefined>
    searchFiles(query: string, kind?: "file" | "folder"): Promise<FileSearchResult>
    // Workspace-relative paths of currently open editor tabs, active document first.
    // Used to pin open files to the top of @file search results.
    getOpenFiles?(): string[]
    terminalContext(): Promise<string>
    gitChangesContext(directory: string): Promise<string>
  }
  createEmitter<T>(): Emitter<T>
}
