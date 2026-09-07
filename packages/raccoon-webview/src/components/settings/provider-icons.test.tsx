import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { hasProviderIcon, ProviderIcon } from "./provider-icons"

test("renders the Raccoon provider with transparent theme-aware plugin icons", () => {
  const html = renderToStaticMarkup(<ProviderIcon id="raccoon" name="Raccoon" />)

  expect(hasProviderIcon("raccoon")).toBe(true)
  expect(html).toContain('role="img"')
  expect(html).toContain('aria-label="Raccoon"')
  expect(html).toContain("raccoon-vscode/images/raccoon.svg")
  expect(html).toContain("raccoon-vscode/images/raccoon-dark.svg")
  expect(html).not.toContain("raccoon-vscode/images/icon.png")
  expect(html).not.toContain(">RA<")
})
