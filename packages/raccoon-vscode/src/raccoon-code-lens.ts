import * as vscode from "vscode"
import { RaccoonProvider } from "./raccoon-provider.js"

const actions = [
  { title: "问答", command: "raccoon.askFunction", type: "ASK" as const },
  { title: "优化", command: "raccoon.optimizeFunction", type: "OPTIMIZE" as const },
  { title: "重构", command: "raccoon.refactorFunction", type: "REFACTOR" as const },
  { title: "注释", command: "raccoon.commentFunction", type: "COMMENT" as const },
]

export class RaccoonCodeLensProvider implements vscode.CodeLensProvider {
  onDidChangeCodeLenses?: vscode.Event<void> | undefined

  constructor(
    _provider: RaccoonProvider,
    private readonly output: vscode.OutputChannel,
  ) {}

  async provideCodeLenses(document: vscode.TextDocument) {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[] | vscode.SymbolInformation[]>(
      "vscode.executeDocumentSymbolProvider",
      document.uri,
    )
    if (!symbols?.length) {
      this.output.appendLine(`Raccoon CodeLens: no symbols for ${document.uri.fsPath}`)
      return []
    }

    const lenses = collectCodeLenses(document, symbols)
    this.output.appendLine(`Raccoon CodeLens: ${lenses.length} lenses for ${document.uri.fsPath}`)
    return lenses
  }
}

function collectCodeLenses(document: vscode.TextDocument, symbols: (vscode.DocumentSymbol | vscode.SymbolInformation)[]) {
  return symbols.flatMap((symbol) => collectSymbolLenses(document, symbol))
}

function collectSymbolLenses(document: vscode.TextDocument, symbol: vscode.DocumentSymbol | vscode.SymbolInformation): vscode.CodeLens[] {
  if (symbol instanceof vscode.SymbolInformation) {
    return isFunctionLike(symbol.kind) ? buildLenses(document.uri, symbol.location.range) : []
  }
  const current = isFunctionLike(symbol.kind) ? buildLenses(document.uri, symbol.range) : []
  return [...current, ...symbol.children.flatMap((child) => collectSymbolLenses(document, child))]
}

function buildLenses(uri: vscode.Uri, range: vscode.Range) {
  return actions.map(
    (action) =>
      new vscode.CodeLens(range, {
        title: action.title,
        command: action.command,
        arguments: [uri, range, action.type],
      }),
  )
}

function isFunctionLike(kind: vscode.SymbolKind) {
  return kind === vscode.SymbolKind.Function || kind === vscode.SymbolKind.Method || kind === vscode.SymbolKind.Constructor
}
