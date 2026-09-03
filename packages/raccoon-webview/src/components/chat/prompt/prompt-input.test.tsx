import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LanguageProvider } from "../../../context/language"
import { SessionProvider } from "../../../context/session"
import { VSCodeProvider } from "../../../context/vscode"
import { PromptInput } from "./prompt-input"

test("renders a compact two-row prompt before it grows with content", () => {
  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <PromptInput />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).toContain('rows="2"')
})
