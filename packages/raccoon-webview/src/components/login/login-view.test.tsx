import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LanguageProvider } from "../../context/language"
import { SessionProvider } from "../../context/session"
import { VSCodeProvider } from "../../context/vscode"
import { LoginView } from "./login-view"

test("renders browser, phone, and email sign-in methods with shared server address and supported phone country codes", () => {
  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <LoginView />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).toContain('role="tablist"')
  expect(html.match(/role="tab"/g)).toHaveLength(3)
  expect(html).toContain('type="tel"')
  expect(html).toContain('name="nationCode"')
  expect(html).toContain('<option value="86" selected="">+86</option>')
  expect(html).toContain('<option value="852">+852</option>')
  expect(html).toContain('<option value="853">+853</option>')
  expect(html).toContain('<option value="81">+81</option>')
  expect(html).toContain('type="email"')
  expect(html.match(/type="password"/g)).toHaveLength(2)
  expect(html.match(/name="serverUrl"/g)).toHaveLength(1)
  expect(html).toContain('href="https://xiaohuanxiong.com/register"')
})
