import type { ExtensionToWebview, RaccoonSession, RaccoonState, WebviewToExtension } from "@opencode-ai/raccoon-webview"
import type { RaccoonWebviewSource, WebviewTransport } from "@opencode-ai/raccoon-core"
import type { SidecarToHost } from "./rpc.js"

// WebviewTransport backed by the stdio bridge. Mirrors raccoon-vscode's RaccoonWebviewHost,
// except the IntelliJ port has a single chat surface: settings renders inline in the chat
// webview (like history) rather than a second tool-window tab. The orchestrator posts protocol
// messages here and we forward them to the Kotlin host, which relays them into the JCEF webview.
// Readiness gating matches the VSCode host so messages produced before the chat surface mounts
// are buffered, not dropped.
export class SidecarWebviewTransport implements WebviewTransport {
  private ready = false
  private readonly pendingChatMessages: ExtensionToWebview[] = []
  private messageHandler: (message: WebviewToExtension, source: RaccoonWebviewSource) => void = () => {}

  constructor(private readonly send: (message: SidecarToHost) => void) {}

  // Called by the host loop when a webview message arrives over stdin.
  dispatch(message: WebviewToExtension, source: RaccoonWebviewSource) {
    this.messageHandler(message, source)
  }

  onMessage(handler: (message: WebviewToExtension, source: RaccoonWebviewSource) => void) {
    this.messageHandler = handler
  }

  // Settings has no dedicated surface here; drive the chat webview into/out of its inline
  // settings view (parallel to showHistory), so the orchestrator's openSettings/closeSettings
  // ports Just Work without a second webview.
  openSettings() {
    this.post("chat", { type: "showSettings" })
  }

  closeSettings() {
    this.post("chat", { type: "showChat" })
  }

  markReady(source: RaccoonWebviewSource) {
    if (source !== "chat") return
    this.ready = true
    while (this.pendingChatMessages.length > 0) {
      this.send({ type: "post", source: "chat", message: this.pendingChatMessages.shift()! })
    }
  }

  post(source: RaccoonWebviewSource, message: ExtensionToWebview) {
    if (!this.ready) {
      this.pendingChatMessages.push(message)
      return
    }
    this.send({ type: "post", source: "chat", message })
  }

  postState(state: RaccoonState) {
    const activeSession = state.sessions.find((session) => session.id === state.activeSessionID) ?? state.activeSession
    this.post("chat", { type: "state", state: { ...state, activeSession, view: "chat" } })
  }

  postSession(session: RaccoonSession) {
    this.post("chat", { type: "sessionUpdated", session })
  }

  postError(message: string) {
    this.post("chat", { type: "error", message })
  }

  postRaccoonLoginFinished() {
    this.post("chat", { type: "raccoonLoginFinished" })
  }

  postCustomProviderSaved(providerID: string) {
    this.post("chat", { type: "customProviderSaved", providerID })
  }
}
