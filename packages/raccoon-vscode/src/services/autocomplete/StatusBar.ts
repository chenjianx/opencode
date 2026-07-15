import * as vscode from "vscode"

export const AUTOCOMPLETE_STATUS_MENU_COMMAND = "raccoon.autocomplete.statusMenu"

type AutocompleteStatus = "idle" | "generating" | "disabled" | "loggedOut" | "error"

/**
 * Status bar item reflecting the inline autocomplete state so users can see at a
 * glance whether completions are running. Clicking it opens a quick-pick menu
 * (handled by the manager).
 */
export class AutocompleteStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem
  private status: AutocompleteStatus = "idle"

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
    this.item.command = AUTOCOMPLETE_STATUS_MENU_COMMAND
    this.render()
    this.item.show()
  }

  public setStatus(status: AutocompleteStatus): void {
    if (this.status === status) return
    this.status = status
    this.render()
  }

  private render(): void {
    switch (this.status) {
      case "generating":
        this.item.text = "$(loading~spin) Raccoon"
        this.item.tooltip = "Raccoon: generating completion…"
        this.item.color = undefined
        break
      case "disabled":
        this.item.text = "$(circle-slash) Raccoon"
        this.item.tooltip = "Raccoon autocomplete is disabled. Click to enable."
        this.item.color = new vscode.ThemeColor("descriptionForeground")
        break
      case "loggedOut":
        this.item.text = "$(circle-slash) Raccoon"
        this.item.tooltip = "Raccoon autocomplete disabled — sign in to enable."
        this.item.color = new vscode.ThemeColor("descriptionForeground")
        break
      case "error":
        this.item.text = "$(warning) Raccoon"
        this.item.tooltip = "Raccoon autocomplete unavailable (not connected). Click for options."
        this.item.color = new vscode.ThemeColor("statusBarItem.warningForeground")
        break
      case "idle":
      default:
        this.item.text = "$(check) Raccoon"
        this.item.tooltip = "Raccoon autocomplete is active. Click for options."
        this.item.color = undefined
        break
    }
  }

  public dispose(): void {
    this.item.dispose()
  }
}
