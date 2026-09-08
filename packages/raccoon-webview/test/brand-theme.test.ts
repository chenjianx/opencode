import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { chromium, type Browser } from "../../../node_modules/.bun/node_modules/playwright"

let browser: Browser
let server: ReturnType<typeof Bun.serve>
let url: string

beforeAll(async () => {
  const build = Bun.spawn(["bun", "run", "build"], {
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  })
  if ((await build.exited) !== 0) {
    throw new Error(`${await new Response(build.stdout).text()}\n${await new Response(build.stderr).text()}`)
  }

  const css = Bun.file(new URL("../../raccoon-vscode/dist/webview/assets/index.css", import.meta.url))
  server = Bun.serve({
    port: 0,
    fetch(request) {
      if (new URL(request.url).pathname === "/assets/index.css") {
        return new Response(css, { headers: { "content-type": "text/css" } })
      }
      return new Response('<!doctype html><html><head><link rel="stylesheet" href="/assets/index.css"></head><body></body></html>', {
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    },
  })
  url = `http://127.0.0.1:${server.port}`
  browser = await chromium.launch({ channel: "chrome", headless: true })
}, 20_000)

afterAll(async () => {
  await browser?.close()
  server?.stop()
}, 20_000)

describe("VS Code brand theme", () => {
  test("keeps the chat header background transparent", async () => {
    const page = await browser.newPage({ viewport: { width: 420, height: 760 } })
    await page.goto(url)

    const background = await page.evaluate(() => {
      document.body.className = "vscode-light"
      document.documentElement.style.setProperty("--vscode-editor-background", "#123456")

      const chat = document.createElement("section")
      chat.className = "chat-view"
      const header = document.createElement("div")
      header.className = "chat-header"
      chat.append(header)
      document.body.append(chat)

      return getComputedStyle(header).backgroundColor
    })

    expect(background).toBe("rgba(0, 0, 0, 0)")
    await page.close()
  })

  test("uses purple for brand actions while preserving host colors and focus", async () => {
    const page = await browser.newPage({ viewport: { width: 420, height: 760 } })
    await page.goto(url)

    const colors = await page.evaluate(() => {
      document.body.className = "vscode-light"
      document.documentElement.style.setProperty("--vscode-editor-background", "#123456")
      document.documentElement.style.setProperty("--vscode-foreground", "#f1f2f3")
      document.documentElement.style.setProperty("--vscode-focusBorder", "#00ff00")

      const button = document.createElement("button")
      button.className = "ui-button ui-button--primary"
      document.body.append(button)

      const navigation = document.createElement("button")
      navigation.className = "settings-nav-item active"
      document.body.append(navigation)

      const textarea = document.createElement("textarea")
      textarea.className = "ui-textarea"
      document.body.append(textarea)
      textarea.focus()

      return {
        background: getComputedStyle(document.body).backgroundColor,
        foreground: getComputedStyle(document.body).color,
        primary: getComputedStyle(button).backgroundColor,
        selection: getComputedStyle(navigation).boxShadow,
        focus: getComputedStyle(textarea).borderColor,
      }
    })

    expect(colors).toEqual({
      background: "rgb(18, 52, 86)",
      foreground: "rgb(241, 242, 243)",
      primary: "rgb(117, 86, 220)",
      selection: "rgb(117, 86, 220) 2px 0px 0px 0px inset",
      focus: "rgb(0, 255, 0)",
    })

    await page.close()
  })

  test("uses bright purple markers and an accessible solid purple on dark themes", async () => {
    const page = await browser.newPage({ viewport: { width: 420, height: 760 } })
    await page.goto(url)

    const colors = await page.evaluate(() => {
      document.body.className = "vscode-dark"
      const button = document.createElement("button")
      button.className = "ui-button ui-button--primary"
      document.body.append(button)

      const navigation = document.createElement("button")
      navigation.className = "settings-nav-item active"
      document.body.append(navigation)

      return {
        primary: getComputedStyle(button).backgroundColor,
        selection: getComputedStyle(navigation).boxShadow,
      }
    })

    expect(colors).toEqual({
      primary: "rgb(117, 86, 220)",
      selection: "rgb(154, 123, 255) 2px 0px 0px 0px inset",
    })
    await page.close()
  })

  test("defers brand actions to VS Code in high contrast themes", async () => {
    const page = await browser.newPage({ viewport: { width: 420, height: 760 } })
    await page.goto(url)

    const colors = await page.evaluate(() => {
      document.body.className = "vscode-high-contrast"
      document.documentElement.style.setProperty("--vscode-button-background", "#010203")
      document.documentElement.style.setProperty("--vscode-button-foreground", "#fefefe")
      document.documentElement.style.setProperty("--vscode-button-hoverBackground", "#040506")
      document.documentElement.style.setProperty("--vscode-contrastBorder", "#ffff00")

      const button = document.createElement("button")
      button.className = "ui-button ui-button--primary"
      document.body.append(button)

      return {
        background: getComputedStyle(button).backgroundColor,
        foreground: getComputedStyle(button).color,
        border: getComputedStyle(button).borderColor,
      }
    })

    expect(colors).toEqual({
      background: "rgb(1, 2, 3)",
      foreground: "rgb(254, 254, 254)",
      border: "rgb(255, 255, 0)",
    })

    await page.close()
  })

  test("keeps content-width permission options fully visible", async () => {
    const page = await browser.newPage({ viewport: { width: 420, height: 760 } })
    await page.goto(url)

    const clipped = await page.evaluate(() => {
      return [
        ["默认", "允许", "询问", "拒绝"],
        ["Default", "Allow", "Ask", "Deny"],
      ].flatMap((labels) => {
        const root = document.createElement("div")
        root.className = "settings-select-root settings-select-content-width"

        const trigger = document.createElement("button")
        trigger.className = "settings-select-trigger settings-select"
        const triggerValue = document.createElement("span")
        triggerValue.className = "settings-select-value"
        triggerValue.textContent = labels[0]
        const triggerCaret = document.createElement("span")
        triggerCaret.className = "settings-select-caret"
        trigger.append(triggerValue, triggerCaret)

        const sizer = document.createElement("span")
        sizer.className = "settings-select-sizer"
        for (const label of labels) {
          const option = document.createElement("span")
          option.className = "settings-select-sizer-option"
          const text = document.createElement("span")
          text.textContent = label
          const caret = document.createElement("span")
          caret.className = "settings-select-sizer-caret"
          option.append(text, caret)
          sizer.append(option)
        }
        root.append(trigger, sizer)
        document.body.append(root)

        const menu = document.createElement("div")
        menu.className = "settings-select-menu"
        menu.style.width = `${root.getBoundingClientRect().width}px`
        for (const label of labels) {
          const option = document.createElement("button")
          option.className = "settings-select-option"
          const text = document.createElement("span")
          text.textContent = label
          const check = document.createElementNS("http://www.w3.org/2000/svg", "svg")
          check.setAttribute("width", "13")
          check.setAttribute("height", "13")
          option.append(text, check)
          menu.append(option)
        }
        document.body.append(menu)

        return Array.from(menu.querySelectorAll<HTMLElement>("button > span:first-child")).map(
          (text) => text.scrollWidth > text.clientWidth,
        )
      })
    })

    expect(clipped).toEqual([false, false, false, false, false, false, false, false])
    await page.close()
  })
})
