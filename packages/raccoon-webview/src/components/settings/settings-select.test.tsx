import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LanguageProvider } from "../../context/language"
import { VSCodeProvider } from "../../context/vscode"
import { PermissionEditor } from "./permission-editor"
import { Select, SelectField } from "./settings-common"

test("renders shared settings selects as in-app listbox triggers", () => {
  const html = renderToStaticMarkup(
    <Select
      value="project"
      onChange={() => {}}
      options={[
        { value: "project", label: "Project" },
        { value: "user", label: "User" },
      ]}
      ariaLabel="Scope"
    />,
  )

  expect(html).not.toContain("<select")
  expect(html).toContain('aria-haspopup="listbox"')
  expect(html).toContain('aria-expanded="false"')
  expect(html).toContain('aria-label="Scope: Project"')
})

test("renders permission actions without native selects", () => {
  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <PermissionEditor permission={{ "*": "allow" }} onChange={() => {}} />
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).not.toContain("<select")
  expect(html).toContain('aria-haspopup="listbox"')
  expect(html).toContain('aria-label="Bash: 所有命令: 询问"')
})

test("sizes permission action selects to their content", () => {
  const html = renderToStaticMarkup(
    <VSCodeProvider>
      <LanguageProvider>
        <PermissionEditor permission={{ "*": "allow" }} onChange={() => {}} />
      </LanguageProvider>
    </VSCodeProvider>,
  )

  expect(html).toContain('class="settings-select-root settings-select-content-width"')
})

test("keeps the field name in a labeled settings select accessible name", () => {
  const html = renderToStaticMarkup(
    <SelectField
      label="Scope"
      value="project"
      onChange={() => {}}
      options={[{ value: "project", label: "Project" }]}
    />,
  )

  expect(html).toContain('aria-label="Scope: Project"')
})

test("lets an enclosing label name selects without an explicit aria label", () => {
  const html = renderToStaticMarkup(
    <label>
      Scope
      <Select value="project" onChange={() => {}} options={[{ value: "project", label: "Project" }]} />
    </label>,
  )

  expect(html).not.toContain('aria-label="Project"')
})

test("shows an unavailable stored value instead of the first option", () => {
  const html = renderToStaticMarkup(
    <Select
      value="removed-agent"
      onChange={() => {}}
      placeholder="Default agent"
      options={[{ value: "build", label: "Build" }]}
      ariaLabel="Agent"
    />,
  )

  expect(html).toContain('aria-label="Agent: removed-agent"')
  expect(html).toContain('<span class="settings-select-value">removed-agent</span>')
})
