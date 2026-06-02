import { randomBytes } from "node:crypto"
import * as vscode from "vscode"
import { buildCspString } from "./html-utils.js"

export function buildWebviewHtml(
  webview: vscode.Webview,
  opts: {
    scriptUri: vscode.Uri
    styleUri: vscode.Uri
    title: string
    port?: number
  },
) {
  const nonce = randomBytes(16).toString("hex")
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
