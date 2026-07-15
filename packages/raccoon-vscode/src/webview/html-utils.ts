function buildConnectSrc(port?: number) {
  if (port) return `http://127.0.0.1:${port} http://localhost:${port} ws://127.0.0.1:${port} ws://localhost:${port}`
  return "http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*"
}

export function buildCspString(cspSource: string, nonce: string, port?: number) {
  return [
    "default-src 'none'",
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}' 'wasm-unsafe-eval' ${cspSource}`,
    `connect-src ${cspSource} ${buildConnectSrc(port)}`,
    `img-src ${cspSource} data: https:`,
  ].join("; ")
}
