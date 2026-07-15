import * as vscode from "vscode"
import type { EditorContext } from "@opencode-ai/raccoon-core"

// VSCode-specific capture of the active selection / a document range into the neutral
// EditorContext consumed by editor-prompt.ts.

export function getEditorContext() {
  const editor = vscode.window.activeTextEditor
  if (!editor) return
  const selection = editor.selection
  if (selection.isEmpty) return
  return createEditorContext(editor.document, selection)
}

export function createEditorContext(document: vscode.TextDocument, range: vscode.Range): EditorContext | undefined {
  if (range.isEmpty) return
  return {
    filePath: vscode.workspace.asRelativePath(document.uri),
    selectedText: document.getText(range),
    startLine: range.start.line + 1,
    endLine: range.end.line + 1,
    diagnostics: vscode.languages
      .getDiagnostics(document.uri)
      .filter((diagnostic) => diagnostic.range.intersection(range))
      .map((diagnostic) => ({ source: diagnostic.source, message: diagnostic.message })),
  }
}
