import { afterEach, expect, test } from "bun:test"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { LanguageProvider } from "../../context/language"
import { SessionProvider } from "../../context/session"
import { VSCodeProvider } from "../../context/vscode"
import type { RaccoonState } from "../../protocol"
import { nextMcpTab, SettingsMcp } from "./settings-mcp"
import { mcpConnectionAction, SettingsMcpInstalled } from "./settings-mcp-installed"
import { parseMcpJsonConfig } from "./settings-mcp-manual"
import { Textarea } from "./settings-common"

afterEach(() => {
  Reflect.deleteProperty(globalThis, "acquireVsCodeApi")
})

function renderMcp(children: ReactNode, patch?: Partial<RaccoonState>) {
  const state = {
    view: "settings",
    raccoonLoggedIn: true,
    sessions: [],
    messages: [],
    agents: [],
    models: [],
    providers: [],
    customProviders: [],
    mcpMarketplace: { items: [], installed: { project: {}, user: {} } },
    skillMarketplace: { sources: [], items: [], installed: { project: {}, user: {} } },
    mode: "build",
    loading: false,
    ...patch,
  } satisfies RaccoonState

  Object.defineProperty(globalThis, "acquireVsCodeApi", {
    configurable: true,
    value: () => ({
      postMessage: () => {},
      getState: () => state,
      setState: () => {},
    }),
  })

  return renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>{children}</SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )
}

test("MCP navigation exposes tabs and the selected tab", () => {
  const html = renderMcp(<SettingsMcp />)

  expect(html).toContain('role="tablist"')
  expect(html.match(/role="tab"/g)).toHaveLength(3)
  expect(html.match(/tabindex="0"/g)).toHaveLength(1)
  expect(html.match(/tabindex="-1"/g)).toHaveLength(2)
  expect(html).toContain('id="settings-mcp-panel-marketplace"')
  expect(html).toContain('id="settings-mcp-panel-installed"')
  expect(html).toContain('id="settings-mcp-panel-manual"')
})

test("MCP tabs support standard arrow and boundary navigation", () => {
  expect(nextMcpTab("marketplace", "ArrowLeft")).toBe("manual")
  expect(nextMcpTab("marketplace", "ArrowRight")).toBe("installed")
  expect(nextMcpTab("installed", "Home")).toBe("marketplace")
  expect(nextMcpTab("installed", "End")).toBe("manual")
  expect(nextMcpTab("installed", "Enter")).toBeUndefined()
})

test("installed MCP rows expose expansion, connection, and enabled state", () => {
  const html = renderMcp(<SettingsMcpInstalled />, {
    mcpInstalled: {
      servers: [
        {
          id: "time",
          scope: "project",
          config: { type: "local", command: ["uvx", "mcp-server-time"] },
          status: { status: "connected" },
        },
      ],
    },
  })

  expect(html).toContain('aria-expanded="false"')
  expect(html).toContain('class="settings-browser-installed-caret"')
  expect(html).toContain("已连接")
  expect(html).toContain("已启用")
})

test("installed MCP rows only offer reconnect when an enabled server is unavailable", () => {
  expect(mcpConnectionAction("connected", true)).toBeUndefined()
  expect(mcpConnectionAction("failed", true)).toBe("reconnect")
  expect(mcpConnectionAction("disabled", true)).toBe("reconnect")
  expect(mcpConnectionAction("needs_auth", true)).toBeUndefined()
  expect(mcpConnectionAction("needs_client_registration", true)).toBeUndefined()
  expect(mcpConnectionAction("disabled", false)).toBeUndefined()
})

test("manual JSON parsing distinguishes syntax and configuration errors", () => {
  expect(parseMcpJsonConfig("{")).toEqual({ status: "invalid-json" })
  expect(parseMcpJsonConfig('{"mcpServers":{"broken":{"args":[]}}}')).toEqual({ status: "invalid-config" })
})

test("manual JSON parsing returns recognized servers", () => {
  expect(
    parseMcpJsonConfig(
      '{"mcpServers":{"time":{"command":"uvx","args":["mcp-server-time"]}}}',
    ),
  ).toEqual({
    status: "valid",
    servers: [
      {
        id: "time",
        config: { type: "local", command: ["uvx", "mcp-server-time"] },
      },
    ],
  })
})

test("manual JSON parsing rejects partially invalid server collections", () => {
  expect(
    parseMcpJsonConfig(
      '{"mcpServers":{"good":{"command":"cmd"},"bad":{"type":"remote"}}}',
    ),
  ).toEqual({ status: "invalid-config" })
})

test("manual JSON parsing rejects empty names and unknown explicit types", () => {
  expect(parseMcpJsonConfig('{"mcp":{"":{"type":"local","command":["cmd"]}}}')).toEqual({
    status: "invalid-config",
  })
  expect(parseMcpJsonConfig('{"mcp":{"bad":{"type":"bogus","command":["cmd"]}}}')).toEqual({
    status: "invalid-config",
  })
})

test("manual JSON parsing rejects malformed recognized fields", () => {
  const inputs = [
    '{"mcp":{"x":{"type":7,"command":["cmd"]}}}',
    '{"mcp":{"x":{"type":"","command":["cmd"]}}}',
    '{"mcp":{"x":{"type":"local","command":["cmd"],"environment":[]}}}',
    '{"mcp":{"x":{"type":"local","command":["cmd",7]}}}',
    '{"mcp":{"x":{"type":"remote","url":"https://example.com","headers":{"Authorization":7}}}}',
    '{"mcpServers":{"x":{"args":["--flag"]}}}',
    '{"mcpServers":{"x":{"command":"","args":["--flag"]}}}',
    '{"mcp":{"x":{"type":"local","args":["--flag"]}}}',
  ]

  for (const input of inputs) {
    expect(parseMcpJsonConfig(input)).toEqual({ status: "invalid-config" })
  }
})

test("textareas expose validation state and its description", () => {
  const html = renderToStaticMarkup(
    <Textarea
      value="{"
      onChange={() => {}}
      ariaInvalid
      ariaDescribedBy="settings-mcp-json-help settings-mcp-json-error"
    />,
  )

  expect(html).toContain('aria-invalid="true"')
  expect(html).toContain('aria-describedby="settings-mcp-json-help settings-mcp-json-error"')
})
