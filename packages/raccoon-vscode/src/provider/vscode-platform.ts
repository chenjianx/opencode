import * as vscode from "vscode"
import { formatTerminalOutput, gitChangesContext } from "@opencode-ai/raccoon-core"
import type { Disposable, DocumentRangeRef, Emitter, HostPlatform } from "@opencode-ai/raccoon-core"
import { createEditorContext, getEditorContext } from "./editor-context.js"
import { searchFiles } from "./file-search.js"

function isAbsolutePath(filePath: string) {
  if (filePath.charCodeAt(0) === 47) return true
  if (
    filePath.length >= 3 &&
    filePath.charCodeAt(1) === 58 &&
    (filePath.charCodeAt(2) === 92 || filePath.charCodeAt(2) === 47) &&
    ((filePath.charCodeAt(0) >= 65 && filePath.charCodeAt(0) <= 90) ||
      (filePath.charCodeAt(0) >= 97 && filePath.charCodeAt(0) <= 122))
  )
    return true
  return filePath.length >= 2 && filePath.charCodeAt(0) === 92 && filePath.charCodeAt(1) === 92
}

// Resolve a (possibly workspace-relative) path to an absolute path, collapsing any overlap
// between the tail of the workspace directory and the head of the relative path.
function resolveFilePath(filePath: string, directory: string): string {
  if (isAbsolutePath(filePath)) return filePath
  const normalized = filePath.replace(/\\/g, "/").replace(/^\.?\//, "")
  const directoryParts = directory.replace(/\\/g, "/").split("/").filter(Boolean)
  const fileParts = normalized.split("/").filter(Boolean)
  const overlap = fileParts
    .map((_, index) => index + 1)
    .reverse()
    .find(
      (length) =>
        length < fileParts.length &&
        length <= directoryParts.length &&
        fileParts.slice(0, length).join("/") === directoryParts.slice(-length).join("/"),
    )
  const relative = overlap ? fileParts.slice(overlap).join("/") : normalized
  return vscode.Uri.joinPath(vscode.Uri.file(directory), relative).fsPath
}

// VS Code glob patterns interpret [], {}, *, ? as metacharacters. Bracket-wrap them so file
// names like "[id].tsx" match literally.
function escapeGlob(pattern: string): string {
  return pattern.replace(/[*?{}[\]]/g, (c) => `[${c}]`)
}

function showTextDocument(uri: vscode.Uri, line?: number, column?: number): void {
  void vscode.workspace.openTextDocument(uri).then(
    (document) => {
      const options: vscode.TextDocumentShowOptions = { preview: true }
      if (line !== undefined && line > 0) {
        const position = new vscode.Position(line - 1, column !== undefined && column > 0 ? column - 1 : 0)
        options.selection = new vscode.Range(position, position)
      }
      void vscode.window.showTextDocument(document, options)
    },
    // openTextDocument rejects for binary/unsupported types; fall back to vscode.open which
    // handles images, PDFs, and other non-text files via the host's built-in viewers.
    () => void vscode.commands.executeCommand("vscode.open", uri, { preview: true }),
  )
}

// When the resolved path does not exist, search the session directory for a file with the same
// basename. Single match opens directly; multiple matches show a quick pick; no match warns.
function findFallback(directory: string, filePath: string, line?: number, column?: number): void {
  const name = filePath.split(/[\\/]/).pop() || filePath
  const pattern = new vscode.RelativePattern(vscode.Uri.file(directory), `**/${escapeGlob(name)}`)
  void vscode.workspace.findFiles(pattern, "**/node_modules/**", 5).then(
    (matches) => {
      if (matches.length === 1) {
        const match = matches[0]
        if (match) void showTextDocument(match, line, column)
        return
      }
      if (matches.length > 1) {
        const items = matches.map((m) => ({ label: vscode.workspace.asRelativePath(m, false), uri: m }))
        void vscode.window.showQuickPick(items, { placeHolder: `Multiple matches for "${name}"` }).then(
          (pick) => {
            if (pick) void showTextDocument(pick.uri, line, column)
          },
        )
        return
      }
      void vscode.window.showWarningMessage(`File not found: ${filePath}`)
    },
    () => void vscode.window.showWarningMessage(`File not found: ${filePath}`),
  )
}

function readAutocompleteEnabled(): boolean {
  return vscode.workspace.getConfiguration("raccoon.autocomplete").get<boolean>("enableAutoTrigger") ?? true
}

// VSCode terminal capture: snapshot the clipboard, select+copy the active terminal, then
// restore the clipboard. The pure formatting lives in context-mentions.formatTerminalOutput.
async function captureTerminal(): Promise<string> {
  const terminal = vscode.window.activeTerminal
  if (!terminal) return "No active terminal is available."

  const saved = await vscode.env.clipboard.readText()
  try {
    await vscode.commands.executeCommand("workbench.action.terminal.selectAll")
    await vscode.commands.executeCommand("workbench.action.terminal.copySelection")
    await vscode.commands.executeCommand("workbench.action.terminal.clearSelection")
    const copied = await vscode.env.clipboard.readText()
    return formatTerminalOutput(terminal.name, copied, saved)
  } finally {
    await vscode.env.clipboard.writeText(saved)
  }
}

class VscodeEmitter<T> implements Emitter<T> {
  private readonly inner = new vscode.EventEmitter<T>()
  event(listener: (value: T) => void): Disposable {
    return this.inner.event(listener)
  }
  fire(value: T) {
    this.inner.fire(value)
  }
  dispose() {
    this.inner.dispose()
  }
}

// The VSCode implementation of HostPlatform. Everything that touches the `vscode` API on
// behalf of the orchestrator lives here (or in the C-layer modules it delegates to).
export class VscodeHostPlatform implements HostPlatform {
  constructor(
    private readonly storageUri: vscode.Uri,
    private readonly output: vscode.OutputChannel,
    readonly storage?: vscode.Memento,
  ) {}

  env = {
    locale: () => vscode.env.language,
  }

  workspace = {
    directory: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(),
  }

  settings = {
    getAutocompleteEnabled: () => readAutocompleteEnabled(),
    setAutocompleteEnabled: async (enabled: boolean) => {
      await vscode.workspace
        .getConfiguration("raccoon.autocomplete")
        .update("enableAutoTrigger", enabled, vscode.ConfigurationTarget.Global)
    },
    onAutocompleteEnabledChange: (listener: (enabled: boolean) => void): Disposable =>
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration("raccoon.autocomplete.enableAutoTrigger")) return
        listener(readAutocompleteEnabled())
      }),
  }

  fs = {
    writeTempFile: async (relativeParts: string[], data: Uint8Array): Promise<string> => {
      const target = vscode.Uri.joinPath(this.storageUri, ...relativeParts)
      const dir = vscode.Uri.joinPath(target, "..")
      await vscode.workspace.fs.createDirectory(dir)
      await vscode.workspace.fs.writeFile(target, data)
      return target.fsPath
    },
  }

  ui = {
    revealChat: async () => {
      await vscode.commands.executeCommand("workbench.view.extension.raccoon")
    },
    openFile: (filePath: string, directory: string, line?: number, column?: number) => {
      const uri = vscode.Uri.file(resolveFilePath(filePath, directory))
      void vscode.workspace.fs.stat(uri).then(
        (stat) => {
          if (stat.type & vscode.FileType.Directory) {
            void vscode.commands.executeCommand("revealInExplorer", uri)
            return
          }
          showTextDocument(uri, line, column)
        },
        () => findFallback(directory, filePath, line, column),
      )
    },
    openPath: async (target: string) => {
      const uri = target.startsWith("file://") ? vscode.Uri.parse(target) : vscode.Uri.file(target)
      await vscode.commands.executeCommand("vscode.open", uri, { preview: true })
    },
    openExternal: async (url: string) => {
      await vscode.env.openExternal(vscode.Uri.parse(url))
    },
    promptInput: (options: { title: string; prompt?: string }) =>
      Promise.resolve(vscode.window.showInputBox({ title: options.title, prompt: options.prompt, ignoreFocusOut: true })),
    saveFile: async (options: {
      title: string
      saveLabel?: string
      defaultName: string
      directory: string
      filters?: Record<string, string[]>
      data: Uint8Array
    }) => {
      const file = await vscode.window.showSaveDialog({
        title: options.title,
        saveLabel: options.saveLabel,
        filters: options.filters,
        defaultUri: vscode.Uri.file(`${options.directory}/${options.defaultName}`),
      })
      if (!file) return false
      await vscode.workspace.fs.writeFile(file, options.data)
      return true
    },
    showInfo: (message: string) => {
      void vscode.window.showInformationMessage(message)
    },
    log: (message: string) => this.output.appendLine(message),
  }

  editor = {
    getActiveContext: () => getEditorContext(),
    getRangeContext: async (ref: DocumentRangeRef) => {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(ref.uri))
      const range = new vscode.Range(
        new vscode.Position(ref.startLine, ref.startColumn),
        new vscode.Position(ref.endLine, ref.endColumn),
      )
      return createEditorContext(document, range)
    },
    searchFiles: (query: string, kind?: "file" | "folder") => searchFiles({ query, kind }),
    terminalContext: () => captureTerminal(),
    gitChangesContext: (directory: string) => gitChangesContext(directory),
  }

  createEmitter<T>(): Emitter<T> {
    return new VscodeEmitter<T>()
  }
}
