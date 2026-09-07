import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { chromium, type Browser } from "../../../node_modules/.bun/node_modules/playwright"

const designFile = new URL("../settings-design.html", import.meta.url)
let browser: Browser
let server: ReturnType<typeof Bun.serve>

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    async fetch() {
      const file = Bun.file(designFile)
      if (!(await file.exists())) return new Response("Design missing", { status: 404 })
      return new Response(file, { headers: { "content-type": "text/html; charset=utf-8" } })
    },
  })
  browser = await chromium.launch({ channel: "chrome", headless: true })
})

afterAll(async () => {
  await browser?.close()
  server?.stop()
})

describe("responsive settings design", () => {
  test("presents provider settings as a Raccoon workbench", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
    page.setDefaultTimeout(1000)
    await page.goto(`http://127.0.0.1:${server.port}`)

    const navigation = page.getByRole("navigation", { name: "设置分区" })
    expect(await navigation.isVisible()).toBe(true)
    expect(await navigation.getByRole("button", { name: "提供商", exact: true }).locator("svg").isVisible()).toBe(true)
    expect(await page.getByRole("region", { name: "Raccoon 账户" }).isVisible()).toBe(true)
    expect(await page.getByRole("list", { name: "提供商连接状态" }).isVisible()).toBe(true)
    const providerActions = page.getByRole("region", { name: "提供商操作区" })
    expect(await providerActions.isVisible()).toBe(true)
    expect(await providerActions.evaluate((element) => element.getBoundingClientRect().bottom)).toBeGreaterThan(790)

    await page.close()
  })

  test("expands connection details from the provider timeline", async () => {
    const page = await browser.newPage({ viewport: { width: 960, height: 760 } })
    page.setDefaultTimeout(1000)
    await page.goto(`http://127.0.0.1:${server.port}`)

    expect(await page.getByText("13 个可用模型").isVisible()).toBe(false)
    await page.getByRole("button", { name: "展开 OpenAI 连接详情" }).click()
    expect(await page.getByText("13 个可用模型").isVisible()).toBe(true)

    await page.close()
  })

  test("opens the custom provider dialog from the bottom composer", async () => {
    const page = await browser.newPage({ viewport: { width: 960, height: 760 } })
    page.setDefaultTimeout(1000)
    await page.goto(`http://127.0.0.1:${server.port}`)

    await page.getByRole("button", { name: "添加自定义提供商" }).click()
    expect(await page.getByRole("dialog", { name: "添加自定义提供商" }).isVisible()).toBe(true)

    await page.close()
  })

  test("collapses navigation to an icon rail in a narrow editor group", async () => {
    const page = await browser.newPage({ viewport: { width: 280, height: 760 } })
    page.setDefaultTimeout(1000)
    await page.goto(`http://127.0.0.1:${server.port}`)

    const navigation = page.getByRole("navigation", { name: "设置分区" })
    expect(await navigation.isVisible()).toBe(true)
    expect((await navigation.evaluate((element) => element.getBoundingClientRect().width)) <= 52).toBe(true)
    expect(await page.getByRole("combobox", { name: "设置分区" }).isVisible()).toBe(false)
    const modelButton = navigation.getByRole("button", { name: "模型", exact: true })
    expect(await modelButton.locator("svg").isVisible()).toBe(true)
    await modelButton.click()
    expect(await page.getByRole("heading", { name: "模型", exact: true }).isVisible()).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(280)

    await page.close()
  })

  test("honors colors injected by the active VS Code theme", async () => {
    const page = await browser.newPage({ viewport: { width: 960, height: 760 } })
    page.setDefaultTimeout(1000)
    await page.goto(`http://127.0.0.1:${server.port}`)

    await page.locator("html").evaluate((element) => {
      element.style.setProperty("--vscode-editor-background", "#123456")
      element.style.setProperty("--vscode-foreground", "#f1f2f3")
    })

    expect(await page.locator("body").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      "rgb(18, 52, 86)",
    )
    expect(await page.locator("body").evaluate((element) => getComputedStyle(element).color)).toBe(
      "rgb(241, 242, 243)",
    )

    await page.close()
  })

  test("updates the working area when a settings section is selected", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
    page.setDefaultTimeout(1000)
    await page.goto(`http://127.0.0.1:${server.port}`)

    await page.getByRole("button", { name: "模型", exact: true }).click()

    expect(await page.getByRole("heading", { name: "模型", exact: true }).isVisible()).toBe(true)
    expect(await page.getByRole("heading", { name: "默认模型", exact: true }).isVisible()).toBe(true)

    await page.close()
  })

  test("reveals save actions only after a draft setting changes", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
    page.setDefaultTimeout(1000)
    await page.goto(`http://127.0.0.1:${server.port}`)

    expect(await page.getByRole("button", { name: "保存更改" }).isVisible()).toBe(false)
    await page.getByRole("button", { name: "模型", exact: true }).click()
    await page.getByRole("combobox", { name: "默认模型" }).selectOption("deepseek-v3")

    expect(await page.getByRole("button", { name: "保存更改" }).isVisible()).toBe(true)

    await page.close()
  })
})
