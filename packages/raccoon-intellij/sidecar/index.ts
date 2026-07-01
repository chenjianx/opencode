import * as os from "node:os"
import * as path from "node:path"
import { RaccoonProvider } from "@opencode-ai/raccoon-core"
import { SidecarConnection } from "./connection.js"
import { SidecarPlatform } from "./platform.js"
import { SidecarWebviewTransport } from "./transport.js"
import { createStdoutWriter, readStdin, type HostToSidecar } from "./rpc.js"

// Entry point for the Node sidecar that the IntelliJ plugin spawns. It assembles the same
// RaccoonProvider the VSCode extension uses (extension.ts), but wires its three ports to the
// Kotlin host over stdio instead of the vscode API. stdout carries framed RPC only; all human
// logging goes to stderr.

const send = createStdoutWriter(process.stdout)
const log = (message: string) => {
  process.stderr.write(message.endsWith("\n") ? message : message + "\n")
  send({ type: "log", message: message.trimEnd() })
}

function start(init: Extract<HostToSidecar, { type: "init" }>): (message: HostToSidecar) => void {
  const directory = init.directory || process.cwd()
  const storageDir = path.join(os.tmpdir(), "raccoon-intellij")

  const connection = new SidecarConnection(directory, log)
  const platform = new SidecarPlatform({
    directory,
    locale: init.locale || "en",
    autocompleteEnabled: init.autocompleteEnabled ?? false,
    storageDir,
    log,
  })
  const transport = new SidecarWebviewTransport(send)

  const provider = new RaccoonProvider(connection, platform, transport)

  // Surface the server port to the host once connected so the JCEF webview's CSP can allow
  // direct connections to server-served media (parity with VSCode's port injection).
  connection.onStateChange((state) => {
    if (state === "connected") send({ type: "serverPort", port: connection.getServerConfig()?.port ?? null })
  })

  // Connect eagerly so the server is warming up before the user sends the first message.
  void connection.connect(directory).catch((error) => log(`initial backend connect failed: ${String(error)}`))

  send({ type: "ready" })

  return (message: HostToSidecar) => {
    switch (message.type) {
      case "webviewMessage":
        // Every webview message (including webviewReady) flows through the provider's handler,
        // which owns readiness gating + state refresh. See RaccoonMessageRouter.handle.
        transport.dispatch(message.message, message.source)
        break
      case "dispose":
        provider.dispose()
        connection.dispose()
        process.exit(0)
        break
      case "init":
        // already initialized; ignore duplicate init
        break
    }
  }
}

// Single stdin reader: buffers until the host's init frame (workspace dir + locale), then
// hands subsequent frames to the running provider loop.
let running: ((message: HostToSidecar) => void) | null = null
readStdin(process.stdin, (message) => {
  if (running) {
    running(message)
    return
  }
  if (message.type === "init") running = start(message)
})

