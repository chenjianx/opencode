import { describe, expect, test } from "bun:test"
import type { RaccoonMessagePart } from "../../../protocol"
import { isTodoTool, parseTaskOutput } from "./message-list-tool"

const part = (tool: string): RaccoonMessagePart => ({ id: "prt_1", type: "tool", tool })

describe("isTodoTool", () => {
  test("matches todo tools", () => {
    expect(isTodoTool(part("todowrite"))).toBe(true)
    expect(isTodoTool(part("todoread"))).toBe(true)
  })

  test("does not match the task (subagent) tool", () => {
    expect(isTodoTool(part("task"))).toBe(false)
  })
})

describe("parseTaskOutput", () => {
  test("extracts state and result text from the task envelope", () => {
    const output = [
      '<task id="ses_x" state="completed">',
      "<summary>Did the thing</summary>",
      "<task_result>",
      "# Result",
      "- one",
      "- two",
      "</task_result>",
      "</task>",
    ].join("\n")
    const parsed = parseTaskOutput(output)
    expect(parsed.state).toBe("completed")
    expect(parsed.summary).toBe("Did the thing")
    expect(parsed.text).toBe("# Result\n- one\n- two")
  })

  test("extracts error result text", () => {
    const output = '<task id="ses_x" state="error">\n<task_error>\nboom\n</task_error>\n</task>'
    const parsed = parseTaskOutput(output)
    expect(parsed.state).toBe("error")
    expect(parsed.text).toBe("boom")
  })

  test("falls back to the raw string without an envelope", () => {
    const parsed = parseTaskOutput("plain text result")
    expect(parsed.text).toBe("plain text result")
    expect(parsed.state).toBeUndefined()
  })
})
