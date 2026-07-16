function buildConnectSrc(port?: number, devServerUri?: string) {
  const localServerSrc = port
    ? `http://127.0.0.1:${port} http://localhost:${port} ws://127.0.0.1:${port} ws://localhost:${port}`
    : "http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*"
  if (devServerUri) return `${localServerSrc} ${devServerUri} ${devServerUri.replace(/^http/, "ws")}`
  return localServerSrc
}

export function buildCspString(cspSource: string, nonce: string, port?: number, devServerUri?: string) {
  const devServerSrc = devServerUri ? ` ${devServerUri}` : ""
  const devEvalSrc = devServerUri ? " 'unsafe-eval'" : ""
  return [
    "default-src 'none'",
    `style-src ${cspSource} 'unsafe-inline'${devServerSrc}`,
    `script-src 'nonce-${nonce}' 'wasm-unsafe-eval'${devEvalSrc} ${cspSource}${devServerSrc}`,
    `connect-src ${cspSource} ${buildConnectSrc(port, devServerUri)}`,
    `img-src ${cspSource} data: https:`,
  ].join("; ")
}
