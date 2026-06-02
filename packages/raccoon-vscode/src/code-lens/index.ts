import * as vscode from "vscode"
import { RaccoonProvider } from "../provider/index.js"
import { extractFunctionRanges } from "./function-extractor.js"

const actions = [
  { title: "$(raccoon-icon) $(chevron-down)", command: "raccoon.openFunctionActions" },
]

export class RaccoonCodeLensProvider implements vscode.CodeLensProvider {
  onDidChangeCodeLenses?: vscode.Event<void> | undefined

  constructor(
    _provider: RaccoonProvider,
    private readonly output: vscode.OutputChannel,
  ) {}

  async provideCodeLenses(document: vscode.TextDocument) {
    const ranges = await functionRanges(document)
    if (!ranges.length) {
      this.output.appendLine(`Raccoon CodeLens: no functions for ${document.uri.fsPath}`)
      return []
    }

    const lenses = ranges.flatMap((item) => buildLenses(document.uri, item.range))
    this.output.appendLine(`Raccoon CodeLens: ${lenses.length} lenses for ${document.uri.fsPath}`)
    return lenses
  }
}

function buildLenses(uri: vscode.Uri, range: vscode.Range) {
  return actions.map(
    (action) =>
      new vscode.CodeLens(range, {
        title: action.title,
        command: action.command,
        arguments: [uri, range],
      }),
  )
}

async function functionRanges(document: vscode.TextDocument) {
  const ranges = extractFunctionRanges(document)
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[] | vscode.SymbolInformation[]>(
    "vscode.executeDocumentSymbolProvider",
    document.uri,
  )
  return dedupeRanges([...ranges, ...(symbols?.flatMap((symbol) => collectSymbolRanges(symbol)) ?? [])])
}

function collectSymbolRanges(symbol: vscode.DocumentSymbol | vscode.SymbolInformation): { range: vscode.Range }[] {
  if (symbol instanceof vscode.SymbolInformation) return isFunctionLike(symbol.kind) ? [{ range: symbol.location.range }] : []

  return [
    ...(isFunctionLike(symbol.kind) ? [{ range: symbol.range }] : []),
    ...symbol.children.flatMap((child) => collectSymbolRanges(child)),
  ]
}

function isFunctionLike(kind: vscode.SymbolKind) {
  return kind === vscode.SymbolKind.Function || kind === vscode.SymbolKind.Method || kind === vscode.SymbolKind.Constructor
}

function dedupeRanges(ranges: { range: vscode.Range }[]) {
  const seen = new Set<string>()
  return ranges.filter((item) => {
    const key = `${item.range.start.line}:${item.range.start.character}-${item.range.end.line}:${item.range.end.character}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
