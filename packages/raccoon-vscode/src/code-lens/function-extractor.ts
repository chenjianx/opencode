import { createRequire } from "module"
import path from "path"
import * as vscode from "vscode"

type TreeSitterPoint = {
  row: number
  column: number
}

type TreeSitterNode = {
  type: string
  startPosition: TreeSitterPoint
  endPosition: TreeSitterPoint
  childCount: number
  child(index: number): TreeSitterNode | null
}

type TreeSitterTree = {
  rootNode: TreeSitterNode
}

type TreeSitterParser = {
  setLanguage(language: unknown): void
  parse(text: string): TreeSitterTree
}

type TreeSitterParserConstructor = {
  new (): TreeSitterParser
}

type LanguageConfig = {
  extensions: string[]
  module: string
  exportNames?: string[]
  nodeTypes: Set<string>
}

type FunctionRange = { range: vscode.Range }

const require = createRequire(__filename)

const languages = [
  {
    extensions: [".js", ".jsx", ".mjs", ".cjs"],
    module: "tree-sitter-javascript",
    nodeTypes: new Set([
      "function_declaration",
      "method_definition",
      "generator_function_declaration",
    ]),
  },
  {
    extensions: [".ts", ".mts", ".cts"],
    module: "tree-sitter-typescript",
    exportNames: ["typescript"],
    nodeTypes: new Set([
      "function_declaration",
      "method_definition",
      "abstract_method_signature",
      "method_signature",
      "generator_function_declaration",
    ]),
  },
  {
    extensions: [".tsx"],
    module: "tree-sitter-typescript",
    exportNames: ["tsx"],
    nodeTypes: new Set([
      "function_declaration",
      "method_definition",
      "abstract_method_signature",
      "method_signature",
      "generator_function_declaration",
    ]),
  },
  {
    extensions: [".py", ".pyw"],
    module: "tree-sitter-python",
    nodeTypes: new Set(["function_definition"]),
  },
  {
    extensions: [".sh", ".bash", ".bashrc", ".bash_profile", ".profile", ".zsh", ".zshrc"],
    module: "tree-sitter-bash",
    nodeTypes: new Set(["function_definition"]),
  },
  {
    extensions: [".go"],
    module: "tree-sitter-go",
    nodeTypes: new Set(["function_declaration", "method_declaration"]),
  },
  {
    extensions: [".c", ".h"],
    module: "tree-sitter-c",
    nodeTypes: new Set(["function_definition"]),
  },
  {
    extensions: [".cc", ".cpp", ".cxx", ".c++", ".hh", ".hpp", ".hxx", ".h++"],
    module: "tree-sitter-cpp",
    nodeTypes: new Set(["function_definition"]),
  },
  {
    extensions: [".cs", ".csx"],
    module: "tree-sitter-c-sharp",
    nodeTypes: new Set([
      "constructor_declaration",
      "conversion_operator_declaration",
      "destructor_declaration",
      "local_function_statement",
      "method_declaration",
      "operator_declaration",
    ]),
  },
  {
    extensions: [".rs"],
    module: "tree-sitter-rust",
    nodeTypes: new Set(["function_item"]),
  },
  {
    extensions: [".java"],
    module: "tree-sitter-java",
    nodeTypes: new Set(["constructor_declaration", "method_declaration"]),
  },
  {
    extensions: [".kt", ".kts"],
    module: "@tree-sitter-grammars/tree-sitter-kotlin",
    nodeTypes: new Set(["function_declaration", "secondary_constructor"]),
  },
  {
    extensions: [".swift"],
    module: "tree-sitter-swift",
    nodeTypes: new Set(["function_declaration", "initializer_declaration", "deinitializer_declaration"]),
  },
  {
    extensions: [".php", ".php3", ".php4", ".php5", ".phtml"],
    module: "tree-sitter-php",
    exportNames: ["php_only", "php", "phpOnly"],
    nodeTypes: new Set(["function_definition", "method_declaration", "method", "class_method"]),
  },
  {
    extensions: [".dart"],
    module: "tree-sitter-dart",
    nodeTypes: new Set(["function_signature", "method_signature"]),
  },
  {
    extensions: [".rb", ".rake", ".gemspec"],
    module: "tree-sitter-ruby",
    nodeTypes: new Set(["method", "singleton_method"]),
  },
  {
    extensions: [".scala", ".sc"],
    module: "tree-sitter-scala",
    nodeTypes: new Set(["function_definition"]),
  },
  {
    extensions: [".m", ".mm"],
    module: "tree-sitter-objc",
    nodeTypes: new Set(["function_definition", "method_definition"]),
  },
  {
    extensions: [".lua"],
    module: "tree-sitter-lua",
    nodeTypes: new Set(["function_declaration", "function_definition"]),
  },
  {
    extensions: [".ps1", ".psm1"],
    module: "tree-sitter-powershell",
    nodeTypes: new Set(["function_statement"]),
  },
] satisfies LanguageConfig[]

const parsers = new Map<string, TreeSitterParser>()

export function extractFunctionRanges(document: vscode.TextDocument) {
  const config = languageConfig(document.fileName)
  if (!config) return []

  try {
    const parser = parserFor(config)
    if (!parser) return []

    const ranges: FunctionRange[] = []
    collectFunctions(parser.parse(document.getText()).rootNode, config, ranges)
    return ranges
  } catch {
    return []
  }
}

function languageConfig(fileName: string) {
  const extension = path.extname(fileName)
  return languages.find((language) => language.extensions.includes(extension))
}

function parserFor(config: LanguageConfig) {
  const key = config.exportNames ? `${config.module}:${config.exportNames.join(",")}` : config.module
  const cached = parsers.get(key)
  if (cached) return cached

  const Parser = require("tree-sitter") as TreeSitterParserConstructor
  const grammar = require(config.module) as Record<string, unknown>
  const parser = parserFromGrammar(Parser, grammar, config)
  if (!parser) return

  parsers.set(key, parser)
  return parser
}

function collectFunctions(node: TreeSitterNode, config: LanguageConfig, ranges: FunctionRange[]) {
  if (config.nodeTypes.has(node.type)) {
    ranges.push({ range: rangeFromNode(node) })
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (!child) continue
    collectFunctions(child, config, ranges)
  }
}

function rangeFromNode(node: TreeSitterNode) {
  return new vscode.Range(pointFromTreeSitter(node.startPosition), pointFromTreeSitter(node.endPosition))
}

function pointFromTreeSitter(point: TreeSitterPoint) {
  return new vscode.Position(point.row, point.column)
}

function parserFromGrammar(Parser: TreeSitterParserConstructor, grammar: Record<string, unknown>, config: LanguageConfig) {
  return [
    ...(config.exportNames ?? []).map((name) => grammar[name]),
    grammar,
    grammar.default,
    grammar.language,
  ].filter(Boolean).reduce<TreeSitterParser | undefined>((current, language) => {
    if (current) return current

    try {
      const parser = new Parser()
      parser.setLanguage(language)
      return parser
    } catch {
      return
    }
  }, undefined)
}
