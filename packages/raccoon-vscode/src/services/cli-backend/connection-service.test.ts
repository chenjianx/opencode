import { beforeAll, describe, expect, mock, test } from "bun:test"
import type { RaccoonConnectionService as RaccoonConnectionServiceType } from "./connection-service"

let RaccoonConnectionService: typeof RaccoonConnectionServiceType

beforeAll(async () => {
  mock.module("vscode", () => ({}))
  RaccoonConnectionService = (await import("./connection-service")).RaccoonConnectionService
})

describe("RaccoonConnectionService", () => {
  test("discards a stale client after the managed server exits", async () => {
    let exitListener = () => undefined
    let starts = 0
    const manager = {
      getServer: async () => ({ url: `http://127.0.0.1:${++starts}` }),
      onServerExit: (listener: () => void) => {
        exitListener = listener
        return () => undefined
      },
      stop: async () => undefined,
    }
    const connection = new RaccoonConnectionService({} as never, {} as never, manager as never)

    const first = await connection.getClientAsync("/workspace")
    exitListener()
    const second = await connection.getClientAsync("/workspace")

    expect(second).not.toBe(first)
    expect(starts).toBe(2)
  })

  test("waits for server shutdown and rejects later connections", async () => {
    let stopped = false
    const manager = {
      getServer: async () => ({ url: "http://127.0.0.1:9000" }),
      onServerExit: () => () => undefined,
      stop: async () => {
        await Promise.resolve()
        stopped = true
      },
    }
    const connection = new RaccoonConnectionService({} as never, {} as never, manager as never)

    await connection.shutdown()

    expect(stopped).toBe(true)
    await expect(connection.connect("/workspace")).rejects.toThrow("disposed")
  })
})
