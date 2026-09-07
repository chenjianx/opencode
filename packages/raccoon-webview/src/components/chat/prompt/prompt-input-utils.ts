import type { ExtensionToWebview, RaccoonFileAttachment, RaccoonSlashCommand, WebviewToExtension } from "../../../protocol"
import type { I18nKey } from "../../../i18n/en"

export function promptSendState(input: { busy: boolean; canSend: boolean; submitting: boolean }) {
  if (input.busy || input.submitting) return "busy"
  if (input.canSend) return "ready"
  return "disabled"
}

export function slashQuery(value: string, selectionStart: number | null) {
  const cursor = selectionStart ?? value.length
  if (!value.startsWith("/") || cursor === 0) return
  const beforeCursor = value.slice(0, cursor)
  if (beforeCursor.match(/\s/)) return
  if (value.match(/^\S+\s+\S+\s*$/)) return
  return beforeCursor.slice(1).toLowerCase()
}

export function commandGroupLabel(source: RaccoonSlashCommand["source"]): I18nKey {
  if (source === "ui") return "prompt.commandGroup.app"
  if (source === "command") return "prompt.commandGroup.commands"
  if (source === "mcp") return "prompt.commandGroup.mcp"
  return "prompt.commandGroup.skill"
}

export function modeLabel(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

type VSCodeBridge = {
  postMessage: (message: WebviewToExtension) => void
  onMessage: (handler: (message: ExtensionToWebview) => void) => () => void
}

export function requestContext(vscode: VSCodeBridge, kind: "terminal" | "git-changes", sessionID?: string) {
  return new Promise<string>((resolve, reject) => {
    const requestID = `${kind}-context-${Date.now()}-${Math.random().toString(36).slice(2)}`
    let unsubscribe = () => {}
    const timeout = setTimeout(
      () => {
        unsubscribe()
        reject(new Error(`Timed out while reading ${kind === "terminal" ? "terminal output" : "git changes"}`))
      },
      kind === "terminal" ? 10_000 : 15_000,
    )
    const done = (run: () => void) => {
      clearTimeout(timeout)
      unsubscribe()
      run()
    }
    unsubscribe = vscode.onMessage((message) => {
      if (kind === "terminal" && message.type === "terminalContextResult" && message.requestID === requestID) {
        done(() => resolve(message.content))
        return
      }
      if (kind === "terminal" && message.type === "terminalContextError" && message.requestID === requestID) {
        done(() => reject(new Error(message.error)))
        return
      }
      if (kind === "git-changes" && message.type === "gitChangesContextResult" && message.requestID === requestID) {
        done(() => resolve(message.content))
        return
      }
      if (kind === "git-changes" && message.type === "gitChangesContextError" && message.requestID === requestID) {
        done(() => reject(new Error(message.error)))
      }
    })
    vscode.postMessage({
      type: kind === "terminal" ? "requestTerminalContext" : "requestGitChangesContext",
      requestID,
      sessionID,
    })
  })
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.addEventListener("error", () => resolve(""))
    reader.addEventListener("load", () => {
      const value = typeof reader.result === "string" ? reader.result : ""
      const index = value.indexOf(",")
      resolve(index === -1 ? value : value.slice(index + 1))
    })
    reader.readAsDataURL(file)
  })
}

export async function buildImageAttachments(files: File[]): Promise<RaccoonFileAttachment[]> {
  const images = files.filter((file) => file.type.startsWith("image/"))
  if (images.length === 0) return []
  const next = await Promise.all<RaccoonFileAttachment | null>(
    images.map(async (file, index) => {
      const data = await fileToDataUrl(file)
      if (!data) return null
      const name = file.name || `image-${Date.now()}-${index}.png`
      return {
        path: name,
        filename: name,
        mime: file.type || "image/png",
        url: data.startsWith("data:") ? data : `data:${file.type || "image/png"};base64,${data}`,
      } satisfies RaccoonFileAttachment
    }),
  )
  return next.filter((item): item is RaccoonFileAttachment => !!item)
}
