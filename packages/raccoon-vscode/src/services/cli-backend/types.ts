export type ConnectionState = "connecting" | "connected" | "disconnected" | "error"

export type ServerConfig = {
  baseUrl: string
  port?: number
}
