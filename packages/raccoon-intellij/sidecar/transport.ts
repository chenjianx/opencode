import type { ExtensionToWebview, RaccoonSession, RaccoonState, WebviewToExtension } from "@opencode-ai/raccoon-webview"
import type { RaccoonWebviewSource, WebviewTransport } from "@opencode-ai/raccoon-core"
import type { SidecarToHost } from "./rpc.js"

// WebviewTransport backed by the stdio bridge. Mirrors raccoon-vscode's RaccoonWebviewHost:
// the orchestrator posts protocol messages here and we forward them to the Kotlin host, which
// relays them into the JCEF webview. Readiness gating matches the VSCode host so messages
// produced before the chat surface mounts are buffered, not dropped.
export class SidecarWebviewTransport implements WebviewTransport {
  private ready = false
  private settingsReady = false
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

  openSettings() {
    this.send({ type: "openSettings" })
  }

  closeSettings() {
    this.send({ type: "closeSettings" })
  }

  markReady(source: RaccoonWebviewSource) {
    if (source === "settings") this.settingsReady = true
    if (source === "chat") {
      this.ready = true
      while (this.pendingChatMessages.length > 0) {
        this.send({ type: "post", source: "chat", message: this.pendingChatMessages.shift()! })
      }
    }
  }

  post(source: RaccoonWebviewSource, message: ExtensionToWebview) {
    if (source === "chat" && !this.ready) {
      this.pendingChatMessages.push(message)
      return
    }
    if (source === "settings" && !this.settingsReady) return
    this.send({ type: "post", source, message })
  }

  postState(state: RaccoonState) {
    const activeSession = state.sessions.find((session) => session.id === state.activeSessionID) ?? state.activeSession
    if (this.ready) {
      this.send({ type: "post", source: "chat", message: { type: "state", state: { ...state, activeSession, view: "chat" } } })
    }
    if (this.settingsReady) {
      this.send({
        type: "post",
        source: "settings",
        message: { type: "state", state: { ...state, activeSession, view: "settings" } },
      })
    }
  }

  postSession(session: RaccoonSession) {
    const message = { type: "sessionUpdated", session } as const
    if (this.ready) this.send({ type: "post", source: "chat", message })
    if (this.settingsReady) this.send({ type: "post", source: "settings", message })
  }

  postError(message: string) {
    const payload = { type: "error", message } satisfies ExtensionToWebview
    if (this.ready) this.send({ type: "post", source: "chat", message: payload })
    if (this.settingsReady) this.send({ type: "post", source: "settings", message: payload })
  }

  postRaccoonLoginFinished() {
    const payload = { type: "raccoonLoginFinished" } satisfies ExtensionToWebview
    if (this.ready) this.send({ type: "post", source: "chat", message: payload })
    if (this.settingsReady) this.send({ type: "post", source: "settings", message: payload })
  }

  postCustomProviderSaved(providerID: string) {
    const payload = { type: "customProviderSaved", providerID } satisfies ExtensionToWebview
    if (this.ready) this.send({ type: "post", source: "chat", message: payload })
    if (this.settingsReady) this.send({ type: "post", source: "settings", message: payload })
  }
}
