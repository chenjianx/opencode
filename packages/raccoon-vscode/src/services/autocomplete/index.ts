import * as vscode from "vscode"
import { AutocompleteServiceManager } from "./AutocompleteServiceManager.js"
import type { RaccoonConnectionService } from "../cli-backend/index.js"

export const registerAutocompleteProvider = (
  context: vscode.ExtensionContext,
  connectionService: RaccoonConnectionService,
): void => {
  const output = vscode.window.createOutputChannel("Raccoon Autocomplete")
  context.subscriptions.push(output)
  // Diagnostic logging is opt-in via `raccoon.autocomplete.debug` to avoid noise.
  const log = (msg: string) => {
    if (vscode.workspace.getConfiguration("raccoon.autocomplete").get<boolean>("debug")) {
      output.appendLine(msg)
    }
  }
  const manager = new AutocompleteServiceManager(connectionService, log)
  context.subscriptions.push(manager)

  context.subscriptions.push(
    vscode.commands.registerCommand("raccoon.autocomplete.reload", async () => {
      await manager.load()
    }),
    vscode.commands.registerCommand("raccoon.autocomplete.generateSuggestions", async () => {
      await manager.codeSuggestion()
    }),
    vscode.commands.registerCommand("raccoon.autocomplete.cancelSuggestions", () => {
      vscode.commands.executeCommand("editor.action.inlineSuggest.hide")
      vscode.commands.executeCommand("setContext", "raccoon.autocomplete.hasSuggestions", false)
    }),
    vscode.commands.registerCommand("raccoon.autocomplete.disable", async () => {
      await manager.disable()
    }),
    vscode.commands.registerCommand("raccoon.autocomplete.statusMenu", async () => {
      await manager.showStatusMenu()
    }),
  )

  // Reload when autocomplete settings change (toggled from settings UI).
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("raccoon.autocomplete")) {
        void manager.load()
      }
    }),
  )
}
