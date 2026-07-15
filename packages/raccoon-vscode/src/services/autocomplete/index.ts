import * as vscode from "vscode"
import { AutocompleteServiceManager } from "./AutocompleteServiceManager.js"
import { AUTOCOMPLETE_STATUS_MENU_COMMAND } from "./StatusBar.js"
import type { RaccoonConnectionService } from "../cli-backend/index.js"
import type { RaccoonProvider } from "@opencode-ai/raccoon-core"

export const registerAutocompleteProvider = (
  context: vscode.ExtensionContext,
  connectionService: RaccoonConnectionService,
  provider: RaccoonProvider,
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
    vscode.commands.registerCommand(AUTOCOMPLETE_STATUS_MENU_COMMAND, async () => {
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

  // Reload when the Raccoon login state flips. The backend connection stays
  // "connected" across login/logout (it's a local managed server), so this is
  // the only signal that the user just signed in or out.
  let lastLoggedIn = provider.getState().raccoonLoggedIn
  context.subscriptions.push(
    provider.onDidChangeState(() => {
      const next = provider.getState().raccoonLoggedIn
      if (next === lastLoggedIn) return
      lastLoggedIn = next
      void manager.load()
    }),
  )
}
