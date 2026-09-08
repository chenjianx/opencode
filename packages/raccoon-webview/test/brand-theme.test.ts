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

  test("keeps installed MCP details compact without a nested card", async () => {
    const page = await browser.newPage({ viewport: { width: 960, height: 760 } })
    await page.goto(url)

    const styles = await page.evaluate(() => {
      document.body.className = "vscode-light"

      const detail = document.createElement("div")
      detail.className = "settings-browser-installed-detail"
      const transport = document.createElement("div")
      transport.className = "settings-browser-transport"
      const section = document.createElement("div")
      const title = document.createElement("div")
      title.className = "settings-browser-transport-title"
      title.textContent = "启动命令"
      const code = document.createElement("code")
      code.textContent = "uvx mcp-server-time"
      section.append(title, code)
      transport.append(section)
      const actions = document.createElement("div")
      actions.className = "settings-browser-actions"
      actions.append(document.createElement("button"))
      detail.append(transport, actions)
      document.body.append(detail)

      return {
        detailGap: getComputedStyle(detail).gap,
        detailPaddingTop: getComputedStyle(detail).paddingTop,
        sectionBorderTop: getComputedStyle(section).borderTopWidth,
        sectionBackground: getComputedStyle(section).backgroundColor,
        codeMarginBottom: getComputedStyle(code).marginBottom,
        actionsBorderTop: getComputedStyle(actions).borderTopWidth,
        actionsPaddingTop: getComputedStyle(actions).paddingTop,
      }
    })

    expect(styles).toEqual({
      detailGap: "8px",
      detailPaddingTop: "10px",
      sectionBorderTop: "0px",
      sectionBackground: "rgba(0, 0, 0, 0)",
      codeMarginBottom: "0px",
      actionsBorderTop: "1px",
      actionsPaddingTop: "8px",
    })
    await page.close()
  })

  test("keeps command selection and details visually lightweight", async () => {
    const page = await browser.newPage({ viewport: { width: 960, height: 760 } })
    await page.goto(url)

    const styles = await page.evaluate(() => {
      document.body.className = "vscode-light"

      const header = document.createElement("div")
      header.className = "settings-rules-intro settings-commands-header"
      const shell = document.createElement("div")
      shell.className = "settings-rules-shell settings-commands-shell"
      const pane = document.createElement("div")
      pane.className = "settings-rules-pane settings-commands-pane"
      const node = document.createElement("button")
      node.className = "settings-rules-node settings-commands-node active"
      pane.append(node)

      const editorHeader = document.createElement("div")
      editorHeader.className = "settings-rules-editor-header settings-commands-editor-header"
      const readonly = document.createElement("div")
      readonly.className = "settings-commands-readonly settings-commands-field-wide"
      shell.append(pane, editorHeader, readonly)
      document.body.append(header, shell)

      return {
        headerBackground: getComputedStyle(header).backgroundColor,
        paneWidth: getComputedStyle(pane).width,
        nodeBorder: getComputedStyle(node).borderTopWidth,
        nodeSelection: getComputedStyle(node).boxShadow,
        editorHeaderBackground: getComputedStyle(editorHeader).backgroundColor,
        readonlyBackground: getComputedStyle(readonly).backgroundColor,
        readonlyBorder: getComputedStyle(readonly).borderTopWidth,
        readonlyPadding: getComputedStyle(readonly).paddingLeft,
      }
    })

    expect(styles).toEqual({
      headerBackground: "rgba(0, 0, 0, 0)",
      paneWidth: "220px",
      nodeBorder: "0px",
      nodeSelection: "rgb(117, 86, 220) 2px 0px 0px 0px inset",
      editorHeaderBackground: "rgb(255, 255, 255)",
      readonlyBackground: "rgba(0, 0, 0, 0)",
      readonlyBorder: "0px",
      readonlyPadding: "0px",
    })
    await page.close()
  })
})
