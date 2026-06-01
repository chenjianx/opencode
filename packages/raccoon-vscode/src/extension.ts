import * as vscode from "vscode"
import { RaccoonCodeLensProvider } from "./raccoon-code-lens.js"
import { RaccoonProvider } from "./raccoon-provider.js"
import { RaccoonConnectionService } from "./services/cli-backend/index.js"

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
}

export function deactivate() {}
