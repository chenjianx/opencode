import { expect, test } from "bun:test"
import { messageForMockLog } from "./vscode"

test("redacts phone credentials from development bridge logs", () => {
  expect(
    messageForMockLog({
      type: "loginRaccoon",
      method: "phone",
      serverUrl: "https://xiaohuanxiong.com",
      nationCode: "86",
      phone: "13800138000",
      password: "secret",
    }),
  ).toEqual({
    type: "loginRaccoon",
    method: "phone",
    serverUrl: "https://xiaohuanxiong.com",
    nationCode: "86",
    phone: "[redacted]",
    password: "[redacted]",
  })
})
