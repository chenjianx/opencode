import * as vscode from "vscode"
import { actionLabels } from "./i18n.js"
import { EDITOR_ACTIONS } from "./actions.js"
import { RaccoonCodeLensProvider } from "./code-lens/index.js"
import { RaccoonProvider } from "@opencode-ai/raccoon-core"
import type { DocumentRangeRef } from "@opencode-ai/raccoon-core"
import { VscodeHostPlatform } from "./provider/vscode-platform.js"
import { RaccoonWebviewHost } from "./provider/webview-host.js"
import { RaccoonConnectionService } from "./services/cli-backend/index.js"
import { registerAutocompleteProvider } from "./services/autocomplete/index.js"

let activeConnection: RaccoonConnectionService | undefined

function rangeRef(uri: vscode.Uri, range: vscode.Range): DocumentRangeRef {
  return {
    uri: uri.toString(),
    startLine: range.start.line,
    startColumn: range.start.character,
    endLine: range.end.line,
    endColumn: range.end.character,
  }
}

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("Raccoon")
  const connection = new RaccoonConnectionService(context, output)
  activeConnection = connection
  const platform = new VscodeHostPlatform(context.globalStorageUri, output, context.globalState)
  const transport = new RaccoonWebviewHost(context.extensionUri, connection)
  const provider = new RaccoonProvider(connection, platform, transport)

  context.subscriptions.push(
    output,
    connection,
    provider,
    vscode.window.registerWebviewViewProvider(
      RaccoonProvider.viewType,
      { resolveWebviewView: (view) => transport.resolveChatView(view) },
      {
        webviewOptions: { retainContextWhenHidden: true },
      },
    ),
    vscode.commands.registerCommand("raccoon.openChat", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.raccoon")
    }),
    vscode.commands.registerCommand("raccoon.focusChat", async () => {
      // Cmd/Ctrl+L: send the current selection to chat if there is one, otherwise just open chat.
      const editor = vscode.window.activeTextEditor
      if (editor && !editor.selection.isEmpty) {
        await provider.appendEditorContext()
      } else {
        await vscode.commands.executeCommand("workbench.view.extension.raccoon")
      }
    }),
    vscode.commands.registerCommand("raccoon.newSession", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.raccoon")
      await provider.createSession()
    }),
    vscode.commands.registerCommand("raccoon.pickSession", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.raccoon")
      await provider.openHistory()
    }),
    vscode.commands.registerCommand("raccoon.openSettings", async () => {
      await provider.openSettings()
    }),
    // Unified editor action vocabulary (see actions.ts). Each command is entry-agnostic:
    // invoked with (uri, range) from the function CodeLens it targets that range; invoked
    // with no args from the context submenu it targets the active selection.
    ...EDITOR_ACTIONS.map((action) =>
      vscode.commands.registerCommand(action.command, async (uri?: vscode.Uri, range?: vscode.Range) => {
        const ref = uri && range ? rangeRef(uri, range) : undefined
        if (action.mode === "append") {
          return ref ? provider.appendDocumentRangeContext(ref) : provider.appendEditorContext()
        }
        return ref ? provider.sendDocumentRangeContext(action.type, ref) : provider.sendEditorContext(action.type)
      }),
    ),
    vscode.commands.registerCommand("raccoon.openFunctionActions", async (uri: vscode.Uri, range: vscode.Range) => {
      const labels = actionLabels(provider.getState().pluginLanguage ?? "en")
      const picked = await vscode.window.showQuickPick(
        EDITOR_ACTIONS.filter((action) => action.lens).map((action) => ({ label: labels[action.id], command: action.command })),
        { placeHolder: labels.placeholder },
      )
      if (!picked) return
      await vscode.commands.executeCommand(picked.command, uri, range)
    }),
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, new RaccoonCodeLensProvider(provider, output)),
  )

  registerAutocompleteProvider(context, connection, provider)

  // Connect to the backend eagerly so inline completion works without first
  // opening the chat panel. Errors are non-fatal — the manager retries on the
  // connection state change and completions stay silent until connected.
  const initialDirectory = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()
  void connection.connect(initialDirectory).catch((error) => {
    output.appendLine(`initial backend connect failed: ${String(error)}`)
  })
}

export async function deactivate() {
  const connection = activeConnection
  activeConnection = undefined
  await connection?.shutdown()
}
