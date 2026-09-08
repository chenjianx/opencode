import assert from "node:assert/strict"
import { createServer } from "node:http"
import { test } from "node:test"
import { RaccoonAuthPlugin } from "./plugin"

test("uses the server context length for discovered model input limits", async () => {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json")
    if (request.url === "/api/plugin/setting/v1/settings") {
      response.end(JSON.stringify({ data: { settings: { capabilities: ["chatv2"] } } }))
      return
    }
    if (request.url === "/api/plugin/org/setting/v1/profiles") {
      response.end(
        JSON.stringify({
          data: {
            config: {
              models: [
                { model: "server-large", defaultCompletionOptions: { contextLength: 200_000 } },
                { model: "server-default", defaultCompletionOptions: {} },
                { model: "server-small", defaultCompletionOptions: { contextLength: 2_048 } },
              ],
            },
          },
        }),
      )
      return
    }
    response.statusCode = 404
    response.end()
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port")

  try {
    const plugin = await RaccoonAuthPlugin({} as never)
    const models = await plugin.provider!.models!(
      { id: "raccoon", name: "Raccoon", models: {} } as never,
      {
        auth: {
          type: "oauth",
          access: "access-token",
          refresh: "refresh-token",
          expires: Date.now() + 120_000,
          enterpriseUrl: `http://127.0.0.1:${address.port}`,
          accountId: "account-id",
          orgCode: "org-code",
        },
      } as never,
    )

    assert.equal(models["server-large"]?.limit.input, 195_904)
    assert.equal(models["server-default"]?.limit.input, 59_904)
    assert.equal(models["server-small"]?.limit.input, 0)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
})
