import assert from "node:assert/strict"
import { createDecipheriv } from "node:crypto"
import { createServer } from "node:http"
import { test } from "node:test"
import { loginWithPhone } from "./password-login"

function decrypt(value: string) {
  const encrypted = Buffer.from(value, "base64")
  const decipher = createDecipheriv("aes-128-cfb", new TextEncoder().encode("senseraccoon2023"), encrypted.subarray(0, 16))
  return Buffer.concat([decipher.update(encrypted.subarray(16)), decipher.final()]).toString("utf8")
}

test("posts encrypted phone credentials to the Raccoon password login endpoint", async () => {
  let requestPath = ""
  let requestContentType = ""
  let body: Record<string, string> = {}
  const server = createServer(async (request, response) => {
    requestPath = request.url ?? ""
    requestContentType = request.headers["content-type"] ?? ""
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, string>
    response.setHeader("Content-Type", "application/json")
    response.end(
      JSON.stringify({
        data: {
          access_token: "access-token",
          refresh_token: "refresh-token",
        },
      }),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port")

  try {
    const result = await loginWithPhone({
      baseUrl: `http://127.0.0.1:${address.port}/raccoon/`,
      nationCode: "852",
      phone: "61234567",
      password: "secret",
    })

    assert.equal(requestPath, "/raccoon/api/plugin/auth/v1/login_with_password")
    assert.match(requestContentType, /application\/json/)
    assert.equal(body.nation_code, "852")
    assert.equal(decrypt(body.phone), "61234567")
    assert.equal(decrypt(body.password), "secret")
    assert.deepEqual(result, { access: "access-token", refresh: "refresh-token" })
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
})

test("rejects unsupported country codes before sending credentials", async () => {
  const server = createServer((_request, response) => response.end())
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port")

  try {
    await assert.rejects(
      loginWithPhone({
        baseUrl: `http://127.0.0.1:${address.port}`,
        nationCode: "1",
        phone: "5551234567",
        password: "secret",
      }),
      /country code/i,
    )
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
})

test("rejects non-local HTTP login addresses", async () => {
  await assert.rejects(
    loginWithPhone({
      baseUrl: "http://example.invalid",
      nationCode: "86",
      phone: "13800138000",
      password: "secret",
    }),
    /HTTPS/i,
  )
})

test("does not forward encrypted credentials through redirects", async () => {
  let redirected = false
  const server = createServer((request, response) => {
    if (request.url === "/capture") {
      redirected = true
      response.setHeader("Content-Type", "application/json")
      response.end(JSON.stringify({ data: { access_token: "access-token", refresh_token: "refresh-token" } }))
      return
    }
    response.statusCode = 307
    response.setHeader("Location", "/capture")
    response.end()
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port")

  try {
    await assert.rejects(
      loginWithPhone({
        baseUrl: `http://127.0.0.1:${address.port}`,
        nationCode: "86",
        phone: "13800138000",
        password: "secret",
      }),
    )
    assert.equal(redirected, false)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
})

test("honors an abort signal while waiting for the login server", async () => {
  const server = createServer(() => {})
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port")

  try {
    await assert.rejects(
      Promise.race([
        loginWithPhone({
          baseUrl: `http://127.0.0.1:${address.port}`,
          nationCode: "86",
          phone: "13800138000",
          password: "secret",
          signal: AbortSignal.timeout(20),
        } as never),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Login request did not abort")), 100)),
      ]),
      /abort|timed out/i,
    )
  } finally {
    server.closeAllConnections()
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  }
})
