export type ConnectionState = "connecting" | "connected" | "disconnected" | "error"

export type ServerConfig = {
  baseUrl: string
  headers?: Record<string, string>
  port?: number
}
