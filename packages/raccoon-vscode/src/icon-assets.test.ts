import { describe, expect, test } from "bun:test"

const images = new URL("../images/", import.meta.url)

describe("raccoon icon assets", () => {
  test("uses the Office line-art raccoon in both theme variants", async () => {
    const [light, dark] = await Promise.all([
      Bun.file(new URL("raccoon.svg", images)).text(),
      Bun.file(new URL("raccoon-dark.svg", images)).text(),
    ])

    expect(light).toContain("M15.3173 10.9648")
    expect(dark).toContain("M15.3173 10.9648")
    expect(light).not.toContain("m234.28,180.82")
    expect(dark).not.toContain("m234.28,180.82")
  })

  test("provides a 512px square marketplace icon", async () => {
    const bytes = new Uint8Array(await Bun.file(new URL("icon.png", images)).arrayBuffer())
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(view.getUint32(16)).toBe(512)
    expect(view.getUint32(20)).toBe(512)
  })
})
