import * as vscode from "vscode"
import { RaccoonProvider } from "./raccoon-provider.js"
import { RaccoonConnectionService } from "./services/cli-backend/index.js"

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("Raccoon")
  const connection = new RaccoonConnectionService(context, output)
  const provider = new RaccoonProvider(context.extensionUri, connection, output, context.globalState)

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
  )
}

export function deactivate() {}
