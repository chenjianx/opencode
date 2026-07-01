// Newline-delimited JSON-RPC over stdio between the Kotlin host and this Node sidecar.
//
// Host -> sidecar (stdin):  { kind: "in", ... }     webview messages + lifecycle
// Sidecar -> host (stdout): { kind: "out", ... }    transport.post* + port report + logs
//
// stdout is reserved exclusively for framed RPC; everything else (server logs, stack
// traces) must go to stderr so the host's line reader never sees a malformed frame.

import type { ExtensionToWebview, WebviewToExtension } from "@opencode-ai/raccoon-webview"
import type { RaccoonWebviewSource } from "@opencode-ai/raccoon-core"

// Messages arriving from the host (decoded from stdin).
export type HostToSidecar =
  | { type: "init"; directory: string; locale: string; autocompleteEnabled: boolean }
  | { type: "webviewMessage"; source: RaccoonWebviewSource; message: WebviewToExtension }
  | { type: "dispose" }

// Messages sent to the host (encoded to stdout). Anything the WebviewTransport would
// post to a webview surface, plus out-of-band signals the Kotlin host needs.
export type SidecarToHost =
  | { type: "post"; source: RaccoonWebviewSource; message: ExtensionToWebview }
  | { type: "openSettings" }
  | { type: "closeSettings" }
  | { type: "serverPort"; port: number | null }
  | { type: "log"; message: string }
  | { type: "ready" }

export function createStdoutWriter(stream: NodeJS.WritableStream) {
  return (message: SidecarToHost) => {
    stream.write(JSON.stringify(message) + "\n")
  }
}

// Reads newline-delimited JSON from stdin and invokes the handler per frame.
// Partial lines are buffered across chunks.
export function readStdin(stream: NodeJS.ReadableStream, handler: (message: HostToSidecar) => void) {
  let buffer = ""
  stream.on("data", (chunk: Buffer | string) => {
    buffer += chunk.toString()
    let newline = buffer.indexOf("\n")
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf("\n")
      if (!line) continue
      try {
        handler(JSON.parse(line) as HostToSidecar)
      } catch (error) {
        process.stderr.write(`[raccoon-sidecar] failed to parse host message: ${String(error)}\n`)
      }
    }
  })
}
