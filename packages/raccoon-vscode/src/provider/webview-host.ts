import * as vscode from "vscode"
import type { ExtensionToWebview, RaccoonSession, RaccoonState, WebviewToExtension } from "@opencode-ai/raccoon-webview"
import type { RaccoonConnectionService } from "../services/cli-backend/index.js"
import { buildWebviewHtml } from "../webview/html.js"
import type { RaccoonWebviewSource, WebviewTransport } from "@opencode-ai/raccoon-core"

export class RaccoonWebviewHost implements WebviewTransport {
  private view?: vscode.WebviewView
  private settingsPanel?: vscode.WebviewPanel
  private ready = false
  private settingsReady = false
  private readonly pendingChatMessages: ExtensionToWebview[] = []
  private messageHandler: (message: WebviewToExtension, source: RaccoonWebviewSource) => void = () => {}

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly connection: RaccoonConnectionService,
  ) {}

  onMessage(handler: (message: WebviewToExtension, source: RaccoonWebviewSource) => void) {
    this.messageHandler = handler
  }

  resolveChatView(view: vscode.WebviewView) {
    this.view = view
    this.ready = false
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    }
    view.webview.html = this.html(view.webview)
    view.webview.onDidReceiveMessage((message: WebviewToExtension) => this.messageHandler(message, "chat"))
  }

  openSettings() {
    if (this.settingsPanel) {
      this.settingsPanel.reveal(vscode.ViewColumn.One)
      return
    }
    const panel = vscode.window.createWebviewPanel("raccoon.settings", "Raccoon Settings", vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [this.extensionUri],
    })
    this.settingsPanel = panel
    panel.iconPath = vscode.Uri.joinPath(this.extensionUri, "images", "raccoon.svg")
    this.settingsReady = false
    panel.webview.html = this.html(panel.webview)
    panel.webview.onDidReceiveMessage((message: WebviewToExtension) => this.messageHandler(message, "settings"))
    panel.onDidDispose(() => {
      if (this.settingsPanel !== panel) return
      this.settingsPanel = undefined
      this.settingsReady = false
    })
  }

  closeSettings() {
    this.settingsPanel?.dispose()
  }

  markReady(source: RaccoonWebviewSource) {
    if (source === "settings") this.settingsReady = true
    if (source === "chat") {
      this.ready = true
      while (this.pendingChatMessages.length > 0) {
        this.view?.webview.postMessage(this.pendingChatMessages.shift()!)
      }
    }
  }

  post(source: RaccoonWebviewSource, message: ExtensionToWebview) {
    const target = this.target(source)
    if (source === "chat" && !this.ready) {
      this.pendingChatMessages.push(message)
      return
    }
    if (source === "settings" && !this.settingsReady) return
    target?.postMessage(message)
  }

  postState(state: RaccoonState) {
    const activeSession = state.sessions.find((session) => session.id === state.activeSessionID) ?? state.activeSession
    if (this.ready) this.view?.webview.postMessage({ type: "state", state: { ...state, activeSession, view: "chat" } })
    if (this.settingsReady) {
      this.settingsPanel?.webview.postMessage({ type: "state", state: { ...state, activeSession, view: "settings" } })
    }
  }

  postSession(session: RaccoonSession) {
    const message = { type: "sessionUpdated", session } as const
    if (this.ready) this.view?.webview.postMessage(message)
    if (this.settingsReady) this.settingsPanel?.webview.postMessage(message)
  }

  postError(message: string) {
    this.view?.webview.postMessage({ type: "error", message } satisfies ExtensionToWebview)
    this.settingsPanel?.webview.postMessage({ type: "error", message } satisfies ExtensionToWebview)
  }

  postRaccoonLoginFinished() {
    this.view?.webview.postMessage({ type: "raccoonLoginFinished" } satisfies ExtensionToWebview)
    this.settingsPanel?.webview.postMessage({ type: "raccoonLoginFinished" } satisfies ExtensionToWebview)
  }

  postCustomProviderSaved(providerID: string) {
    this.view?.webview.postMessage({ type: "customProviderSaved", providerID } satisfies ExtensionToWebview)
    this.settingsPanel?.webview.postMessage({ type: "customProviderSaved", providerID } satisfies ExtensionToWebview)
  }

  private target(source: RaccoonWebviewSource) {
    return source === "chat" ? this.view?.webview : this.settingsPanel?.webview
  }

  private html(webview: vscode.Webview) {
    const dist = vscode.Uri.joinPath(this.extensionUri, "dist", "webview")
    return buildWebviewHtml(webview, {
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(dist, "assets", "index.js")),
      styleUri: webview.asWebviewUri(vscode.Uri.joinPath(dist, "assets", "index.css")),
      title: "Raccoon",
      port: this.connection.getServerConfig()?.port,
    })
  }
}
