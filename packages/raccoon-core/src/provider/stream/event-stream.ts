import type { GlobalEvent, OpencodeClient } from "@opencode-ai/sdk/v2/client"

export class RaccoonEventStream {
  private stream?: Awaited<ReturnType<OpencodeClient["global"]["event"]>>
  private abort?: AbortController
  private directory?: string
  private reconnectTimer?: ReturnType<typeof setTimeout>

  constructor(
    private readonly client: () => Promise<OpencodeClient>,
    private readonly onEvent: (event: GlobalEvent) => void,
    private readonly log: (message: string) => void,
    private readonly onReconnect?: () => void,
  ) {}

  async ensure(directory: string) {
    if (this.stream && this.directory === directory) return
    await this.stop()
    this.directory = directory
    this.abort = new AbortController()
    this.stream = await (await this.client()).global.event({
      signal: this.abort.signal,
      sseMaxRetryAttempts: 1,
      onSseError: (error) => {
        if (!this.abort?.signal.aborted) this.log(`global event stream error: ${String(error)}`)
      },
    })
    void this.consume(this.stream)
  }

  async stop() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    this.abort?.abort()
    await this.stream?.stream.return?.(undefined).catch(() => {})
    this.stream = undefined
    this.abort = undefined
    this.directory = undefined
  }

  dispose() {
    void this.stop()
  }

  private async consume(events: Awaited<ReturnType<OpencodeClient["global"]["event"]>>) {
    try {
      for await (const event of events.stream) {
        this.onEvent(event as GlobalEvent)
      }
    } catch (error) {
      if (!this.abort?.signal.aborted) this.log(`global event stream stopped: ${String(error)}`)
    } finally {
      if (!this.abort?.signal.aborted) this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || !this.directory) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      if (!this.directory) return
      void this.ensure(this.directory)
        .then(() => this.onReconnect?.())
        .catch((error) =>
          this.log(`global event reconnect failed: ${error instanceof Error ? error.message : String(error)}`),
        )
    }, 250)
  }
}
