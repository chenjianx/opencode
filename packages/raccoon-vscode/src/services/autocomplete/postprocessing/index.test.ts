import { describe, expect, test } from "bun:test"
import { postprocessCompletion } from "./index"

const base = { model: "raccoon-pro-completion", prefix: "", suffix: "" }

describe("postprocessCompletion", () => {
  test("drops blank / whitespace-only completions", () => {
    expect(postprocessCompletion({ ...base, completion: "   \n  " })).toBeUndefined()
  })

  test("drops a dangling member access", () => {
    expect(postprocessCompletion({ ...base, completion: "System." })).toBeUndefined()
  })

  test("drops a dangling member access with trailing closer", () => {
    expect(postprocessCompletion({ ...base, completion: "System.)" })).toBeUndefined()
  })

  test("drops a dangling binary operator", () => {
    expect(postprocessCompletion({ ...base, completion: "for (int i = 0; i <" })).toBeUndefined()
  })

  test("spares generics (List<)", () => {
    expect(postprocessCompletion({ ...base, completion: "List<" })).toBe("List<")
  })

  test("strips markdown code fences", () => {
    expect(postprocessCompletion({ ...base, completion: "```ts\nconst a = 1\n```" })).toBe("const a = 1")
  })

  test("removes a duplicated leading space when prefix ends with space", () => {
    expect(postprocessCompletion({ ...base, prefix: "const x =", completion: " 1" })).toBe(" 1")
    expect(postprocessCompletion({ ...base, prefix: "const x = ", completion: " 1" })).toBe("1")
  })

  test("passes a normal completion through", () => {
    expect(postprocessCompletion({ ...base, completion: "doWork();" })).toBe("doWork();")
  })
})
