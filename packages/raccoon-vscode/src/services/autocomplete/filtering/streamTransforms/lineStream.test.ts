import { describe, expect, test } from "bun:test"
import { lineIsRepeated } from "./textSimilarity"
import { stopAtRepeatingLines, stopAtSimilarLine } from "./lineStream"

async function* fromLines(lines: string[]): AsyncGenerator<string> {
  for (const line of lines) yield line
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = []
  for await (const v of gen) out.push(v)
  return out
}

describe("lineIsRepeated", () => {
  test("near-identical lines are repeats", () => {
    expect(lineIsRepeated("let total = aa + bb", "let total = aa + bc")).toBe(true)
  })
  test("short lines are never repeats", () => {
    expect(lineIsRepeated("a()", "a()")).toBe(false)
  })
})

describe("stopAtRepeatingLines", () => {
  test("stops after a line repeats three times", async () => {
    const out = await collect(stopAtRepeatingLines(fromLines(["a();", "x();", "x();", "x();", "b();"]), () => {}))
    expect(out).toEqual(["a();", "x();"])
  })
})

describe("stopAtSimilarLine", () => {
  test("stops at a line near-identical to the line below the cursor", async () => {
    const out = await collect(
      stopAtSimilarLine(fromLines(["doWork();", "let total = aa + bb"]), "let total = aa + bb", () => {}),
    )
    expect(out).toEqual(["doWork();"])
  })

  test("keeps a bracket-only line matching the line below", async () => {
    const out = await collect(stopAtSimilarLine(fromLines(["doWork();", "}"]), "}", () => {}))
    expect(out).toEqual(["doWork();", "}"])
  })
})
