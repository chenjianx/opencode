import * as vscode from "vscode"
import { functionActionLabels } from "./i18n.js"
import { RaccoonCodeLensProvider } from "./code-lens/index.js"
import { RaccoonProvider } from "./provider/index.js"
import { RaccoonConnectionService } from "./services/cli-backend/index.js"
import { registerAutocompleteProvider } from "./services/autocomplete/index.js"

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("Raccoon")
  const connection = new RaccoonConnectionService(context, output)
  const provider = new RaccoonProvider(context.extensionUri, context.globalStorageUri, connection, output, context.globalState)

  context.subscriptions.push(
    output,
    connection,
    provider,
    vscode.window.registerWebviewViewProvider(RaccoonProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("raccoon.openChat", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.raccoon")
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
    vscode.commands.registerCommand("raccoon.explainCode", async () => provider.sendEditorContext("EXPLAIN")),
    vscode.commands.registerCommand("raccoon.fixCode", async () => provider.sendEditorContext("FIX")),
    vscode.commands.registerCommand("raccoon.improveCode", async () => provider.sendEditorContext("IMPROVE")),
    vscode.commands.registerCommand("raccoon.addToContext", async () => provider.appendEditorContext("ADD_TO_CONTEXT")),
    vscode.commands.registerCommand("raccoon.openFunctionActions", async (uri: vscode.Uri, range: vscode.Range) => {
      const labels = functionActionLabels(provider.getState().pluginLanguage ?? "en")
      const action = await vscode.window.showQuickPick(
        [
          { label: labels.ask, type: "ASK" as const },
          { label: labels.optimize, type: "OPTIMIZE" as const },
          { label: labels.refactor, type: "REFACTOR" as const },
          { label: labels.comment, type: "COMMENT" as const },
        ],
        { placeHolder: labels.placeholder },
      )
      if (!action) return
      await provider.sendDocumentRangeContext(action.type, uri, range)
    }),
    vscode.commands.registerCommand("raccoon.askFunction", async (uri: vscode.Uri, range: vscode.Range, type = "ASK") =>
      provider.sendDocumentRangeContext(type, uri, range),
    ),
    vscode.commands.registerCommand("raccoon.optimizeFunction", async (uri: vscode.Uri, range: vscode.Range, type = "OPTIMIZE") =>
      provider.sendDocumentRangeContext(type, uri, range),
    ),
    vscode.commands.registerCommand("raccoon.refactorFunction", async (uri: vscode.Uri, range: vscode.Range, type = "REFACTOR") =>
      provider.sendDocumentRangeContext(type, uri, range),
    ),
    vscode.commands.registerCommand("raccoon.commentFunction", async (uri: vscode.Uri, range: vscode.Range, type = "COMMENT") =>
      provider.sendDocumentRangeContext(type, uri, range),
    ),
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, new RaccoonCodeLensProvider(provider, output)),
  )

  registerAutocompleteProvider(context, connection)

  // Connect to the backend eagerly so inline completion works without first
  // opening the chat panel. Errors are non-fatal — the manager retries on the
  // connection state change and completions stay silent until connected.
  const initialDirectory = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()
  void connection.connect(initialDirectory).catch((error) => {
    output.appendLine(`initial backend connect failed: ${String(error)}`)
  })
}

export function deactivate() {}
