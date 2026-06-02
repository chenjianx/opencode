declare module "tree-sitter" {
  export default class Parser {
    setLanguage(language: unknown): void
    parse(text: string): {
      rootNode: {
        type: string
        startPosition: { row: number; column: number }
        endPosition: { row: number; column: number }
        childCount: number
        child(index: number): this | null
      }
    }
  }
}

declare module "tree-sitter-javascript" {
  const language: unknown
  export = language
}

declare module "tree-sitter-java" {
  const language: unknown
  export = language
}

declare module "tree-sitter-typescript" {
  export const typescript: unknown
  export const tsx: unknown
}

declare module "tree-sitter-python" {
  const language: unknown
  export = language
}

declare module "tree-sitter-c" {
  const language: unknown
  export = language
}

declare module "tree-sitter-cpp" {
  const language: unknown
  export = language
}

declare module "tree-sitter-c-sharp" {
  const language: unknown
  export = language
}

declare module "tree-sitter-bash" {
  const language: unknown
  export = language
}

declare module "tree-sitter-go" {
  const language: unknown
  export = language
}

declare module "tree-sitter-rust" {
  const language: unknown
  export = language
}

declare module "@tree-sitter-grammars/tree-sitter-kotlin" {
  const language: unknown
  export = language
}

declare module "tree-sitter-swift" {
  const language: unknown
  export = language
}

declare module "tree-sitter-php" {
  export const php: unknown
}

declare module "tree-sitter-dart" {
  const language: unknown
  export = language
}

declare module "tree-sitter-ruby" {
  const language: unknown
  export = language
}

declare module "tree-sitter-scala" {
  const language: unknown
  export = language
}

declare module "tree-sitter-objc" {
  const language: unknown
  export = language
}

declare module "tree-sitter-lua" {
  const language: unknown
  export = language
}

declare module "tree-sitter-powershell" {
  const language: unknown
  export = language
}
