import { randomBytes } from "node:crypto"
import * as vscode from "vscode"
import { buildCspString } from "./html-utils.js"

export function buildWebviewHtml(
  webview: vscode.Webview,
  opts: {
    scriptUri: vscode.Uri
    styleUri?: vscode.Uri
    title: string
    port?: number
    devServerUri?: string
  },
) {
  const nonce = randomBytes(16).toString("hex")
  if (opts.devServerUri) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${buildCspString(webview.cspSource, nonce, opts.port, opts.devServerUri)}">
  <title>${opts.title}</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.addEventListener("error", (event) => {
      document.body.textContent = event.message
    })
    window.addEventListener("unhandledrejection", (event) => {
      document.body.textContent = event.reason?.message ?? String(event.reason)
    })
  </script>
  <script nonce="${nonce}" type="module" src="${opts.devServerUri}/@vite/client"></script>
  <script nonce="${nonce}" type="module">
    import RefreshRuntime from "${opts.devServerUri}/@react-refresh"
    RefreshRuntime.injectIntoGlobalHook(window)
    window.$RefreshReg$ = () => {}
    window.$RefreshSig$ = () => (type) => type
    window.__vite_plugin_react_preamble_installed__ = true
  </script>
  <script nonce="${nonce}" type="module" src="${opts.scriptUri}"></script>
</body>
</html>`
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${buildCspString(webview.cspSource, nonce, opts.port)}">
  <link href="${opts.styleUri}" rel="stylesheet">
  <title>${opts.title}</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${opts.scriptUri}"></script>
</body>
</html>`
}
