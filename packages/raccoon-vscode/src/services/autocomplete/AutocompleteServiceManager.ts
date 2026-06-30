import * as vscode from "vscode"
import { AutocompleteInlineCompletionProvider, type AutocompleteSettings } from "./vscodeProvider.js"
import { AutocompleteStatusBar } from "./StatusBar.js"
import type { RaccoonConnectionService } from "../cli-backend/index.js"
import { DEFAULT_AUTOCOMPLETE_MODEL, getAutocompleteModel, isRaccoonLoggedIn } from "@opencode-ai/raccoon-core"

const CONFIG_SECTION = "raccoon.autocomplete"

function readSettings(): AutocompleteSettings {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION)
  return {
    enableAutoTrigger: config.get<boolean>("enableAutoTrigger") ?? true,
    model: getAutocompleteModel(config.get<string>("model") ?? "").id,
    snoozeUntil: config.get<number>("snoozeUntil"),
  }
}

async function writeSettings(patch: Partial<AutocompleteSettings>): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION)
  for (const [key, value] of Object.entries(patch)) {
    await config.update(key, value, vscode.ConfigurationTarget.Global)
  }
}

export class AutocompleteServiceManager implements vscode.Disposable {
  private readonly connectionService: RaccoonConnectionService
  private settings: AutocompleteSettings | null = null

  public readonly inlineCompletionProvider: AutocompleteInlineCompletionProvider
  private inlineCompletionProviderDisposable: vscode.Disposable | null = null
  private unsubscribeState: (() => void) | null = null
  private snoozeTimer: NodeJS.Timeout | null = null
  private readonly statusBar: AutocompleteStatusBar
  private generating = false
  private loggedIn = false

  constructor(connectionService: RaccoonConnectionService, log?: (msg: string) => void) {
    this.connectionService = connectionService
    this.statusBar = new AutocompleteStatusBar()

    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ""

    this.inlineCompletionProvider = new AutocompleteInlineCompletionProvider(
      DEFAULT_AUTOCOMPLETE_MODEL.id,
      connectionService,
      () => this.updateCostTracking(),
      () => this.settings,
      workspacePath,
      (status) => this.handleFatalAutocompleteError(status),
      log,
      (active) => this.handleActivity(active),
    )

    // Reload when backend connection state changes, and reset error backoff —
    // a reconnect may mean the user re-authenticated.
    this.unsubscribeState = connectionService.onStateChange(() => {
      this.inlineCompletionProvider.resetBackoff()
      void this.load()
    })

    void this.load()
  }

  public async load(): Promise<void> {
    this.settings = readSettings()
    this.loggedIn = await isRaccoonLoggedIn()
    if (this.settings.model) {
      this.inlineCompletionProvider.setModel(this.settings.model)
    }
    await this.ensureInlineCompletionProviderRegistration()
    this.setupSnoozeTimerIfNeeded()
    this.refreshStatus()
  }

  private async ensureInlineCompletionProviderRegistration(): Promise<void> {
    const shouldBeRegistered =
      this.loggedIn && (this.settings?.enableAutoTrigger ?? false) && !this.isSnoozed()
    const isRegistered = this.inlineCompletionProviderDisposable !== null

    if (shouldBeRegistered === isRegistered) return

    if (!shouldBeRegistered) {
      this.inlineCompletionProviderDisposable!.dispose()
      this.inlineCompletionProviderDisposable = null
      return
    }

    this.inlineCompletionProviderDisposable = vscode.languages.registerInlineCompletionItemProvider(
      { scheme: "file" },
      this.inlineCompletionProvider,
    )
  }

  public async disable(): Promise<void> {
    await writeSettings({ enableAutoTrigger: false })
    await this.load()
  }

  public async enable(): Promise<void> {
    await writeSettings({ enableAutoTrigger: true })
    await this.load()
  }

  public isSnoozed(): boolean {
    const snoozeUntil = this.settings?.snoozeUntil
    if (!snoozeUntil) return false
    return Date.now() < snoozeUntil
  }

  public async snooze(seconds: number): Promise<void> {
    if (this.snoozeTimer) {
      clearTimeout(this.snoozeTimer)
      this.snoozeTimer = null
    }
    const snoozeUntil = Date.now() + seconds * 1000
    await writeSettings({ snoozeUntil })
    this.snoozeTimer = setTimeout(() => void this.unsnooze(), seconds * 1000)
    await this.load()
  }

  public async unsnooze(): Promise<void> {
    if (this.snoozeTimer) {
      clearTimeout(this.snoozeTimer)
      this.snoozeTimer = null
    }
    await writeSettings({ snoozeUntil: undefined })
    await this.load()
  }

  private setupSnoozeTimerIfNeeded(): void {
    if (this.snoozeTimer) {
      clearTimeout(this.snoozeTimer)
      this.snoozeTimer = null
    }
    const snoozeUntil = this.settings?.snoozeUntil
    const remainingMs = snoozeUntil ? Math.max(0, snoozeUntil - Date.now()) : 0
    if (remainingMs <= 0) return
    this.snoozeTimer = setTimeout(() => void this.unsnooze(), remainingMs)
  }

  /** Manually trigger a completion at the current cursor and insert the first result. */
  public async codeSuggestion(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor) return

    const document = editor.document
    const position = editor.selection.active
    const context: vscode.InlineCompletionContext = {
      triggerKind: vscode.InlineCompletionTriggerKind.Invoke,
      selectedCompletionInfo: undefined,
    }
    const tokenSource = new vscode.CancellationTokenSource()

    const completions = await this.inlineCompletionProvider.provideInlineCompletionItems_Internal(
      document,
      position,
      context,
      tokenSource.token,
    )
    tokenSource.dispose()

    if (!completions) return
    const items = Array.isArray(completions) ? completions : completions.items
    const firstCompletion = items[0]
    if (firstCompletion?.insertText) {
      const insertText =
        typeof firstCompletion.insertText === "string" ? firstCompletion.insertText : firstCompletion.insertText.value
      await editor.edit((editBuilder) => editBuilder.insert(position, insertText))
    }
  }

  private updateCostTracking(): void {
    // No-op for now; cost tracking can be added later.
  }

  private handleActivity(active: boolean): void {
    this.generating = active
    this.refreshStatus()
  }

  /** Recompute and push the current state to the status bar. */
  private refreshStatus(): void {
    if (this.generating) {
      this.statusBar.setStatus("generating")
      return
    }
    if (!this.loggedIn) {
      this.statusBar.setStatus("loggedOut")
      return
    }
    if (this.connectionService.getConnectionState() !== "connected") {
      this.statusBar.setStatus("error")
      return
    }
    if (this.isSnoozed()) {
      this.statusBar.setStatus("snoozed")
      return
    }
    if (!(this.settings?.enableAutoTrigger ?? false)) {
      this.statusBar.setStatus("disabled")
      return
    }
    this.statusBar.setStatus("idle")
  }

  /** Quick-pick shown when the status bar item is clicked. */
  public async showStatusMenu(): Promise<void> {
    const items: (vscode.QuickPickItem & { action: () => Promise<void> | void })[] = !this.loggedIn
      ? [
          {
            label: "$(sign-in) Sign in to Raccoon",
            action: async () => {
              await vscode.commands.executeCommand("raccoon.openChat")
            },
          },
        ]
      : (this.settings?.enableAutoTrigger ?? false) && !this.isSnoozed()
        ? [{ label: "$(circle-slash) Disable autocomplete", action: () => this.disable() }]
        : [{ label: "$(check) Enable autocomplete", action: () => this.enable() }]

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "Raccoon autocomplete",
    })
    await picked?.action()
  }

  private handleFatalAutocompleteError(status: number | null): void {
    const msg =
      status === 402
        ? "Raccoon autocomplete paused: credits exhausted."
        : "Raccoon autocomplete paused: authentication error."
    vscode.window.showWarningMessage(msg)
    this.statusBar.setStatus("error")
  }

  public dispose(): void {
    if (this.snoozeTimer) {
      clearTimeout(this.snoozeTimer)
      this.snoozeTimer = null
    }
    this.unsubscribeState?.()
    this.unsubscribeState = null
    if (this.inlineCompletionProviderDisposable) {
      this.inlineCompletionProviderDisposable.dispose()
      this.inlineCompletionProviderDisposable = null
    }
    this.statusBar.dispose()
    this.inlineCompletionProvider.dispose()
  }
}
