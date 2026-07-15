/**
 * Language metadata for autocomplete, ported as a subset from continue-rac
 * (core/autocomplete/constants/AutocompleteLanguageInfo.ts). Only the fields the
 * prefix/suffix pipeline consumes are kept: singleLineComment and useMultiline.
 * charFilters/lineFilters are intentionally omitted (no language-specific
 * stream filters in this variant).
 */

export interface AutocompleteLanguageInfo {
  singleLineComment?: string
  useMultiline?: (args: { prefix: string; suffix: string }) => boolean
}

const Typescript: AutocompleteLanguageInfo = { singleLineComment: "//" }
const Python: AutocompleteLanguageInfo = { singleLineComment: "#" }
const Java: AutocompleteLanguageInfo = { singleLineComment: "//" }
const Cpp: AutocompleteLanguageInfo = { singleLineComment: "//" }
const CSharp: AutocompleteLanguageInfo = { singleLineComment: "//" }
const C: AutocompleteLanguageInfo = { singleLineComment: "//" }
const Scala: AutocompleteLanguageInfo = { singleLineComment: "//" }
const Go: AutocompleteLanguageInfo = { singleLineComment: "//" }
const Rust: AutocompleteLanguageInfo = { singleLineComment: "//" }
const Haskell: AutocompleteLanguageInfo = { singleLineComment: "--" }
const PHP: AutocompleteLanguageInfo = { singleLineComment: "//" }
const Swift: AutocompleteLanguageInfo = { singleLineComment: "//" }
const Kotlin: AutocompleteLanguageInfo = { singleLineComment: "//" }
const Ruby: AutocompleteLanguageInfo = { singleLineComment: "#" }
const Clojure: AutocompleteLanguageInfo = { singleLineComment: ";" }
const Julia: AutocompleteLanguageInfo = { singleLineComment: "#" }
const FSharp: AutocompleteLanguageInfo = { singleLineComment: "//" }
const R: AutocompleteLanguageInfo = { singleLineComment: "#" }
const Dart: AutocompleteLanguageInfo = { singleLineComment: "//" }
const Solidity: AutocompleteLanguageInfo = { singleLineComment: "//" }
const Lua: AutocompleteLanguageInfo = { singleLineComment: "--" }
const YAML: AutocompleteLanguageInfo = { singleLineComment: "#" }
const Json: AutocompleteLanguageInfo = { singleLineComment: "//" }
const Markdown: AutocompleteLanguageInfo = {
  singleLineComment: "",
  useMultiline: ({ prefix }) => {
    const singleLineStarters: (string | RegExp)[] = ["- ", "* ", /^\d+\. /, "> ", "```", /^#{1,6} /]
    let currentLine = prefix.split("\n").pop()
    if (!currentLine) return true
    currentLine = currentLine.trim()
    for (const starter of singleLineStarters) {
      if (typeof starter === "string" ? currentLine.startsWith(starter) : starter.test(currentLine)) {
        return false
      }
    }
    return true
  },
}

const LANGUAGES: Record<string, AutocompleteLanguageInfo> = {
  ts: Typescript,
  js: Typescript,
  tsx: Typescript,
  jsx: Typescript,
  json: Json,
  ipynb: Python,
  py: Python,
  pyi: Python,
  java: Java,
  cpp: Cpp,
  cxx: Cpp,
  h: Cpp,
  hpp: Cpp,
  cs: CSharp,
  c: C,
  scala: Scala,
  sc: Scala,
  go: Go,
  rs: Rust,
  hs: Haskell,
  php: PHP,
  rb: Ruby,
  swift: Swift,
  kt: Kotlin,
  clj: Clojure,
  cljs: Clojure,
  cljc: Clojure,
  jl: Julia,
  fs: FSharp,
  fsi: FSharp,
  fsx: FSharp,
  r: R,
  R: R,
  dart: Dart,
  sol: Solidity,
  yaml: YAML,
  yml: YAML,
  md: Markdown,
  lua: Lua,
  luau: Lua,
}

function fileExtension(filepath: string): string {
  const base = filepath.split(/[\\/]/).pop() ?? filepath
  const dot = base.lastIndexOf(".")
  return dot === -1 ? "" : base.slice(dot + 1)
}

export function languageForFilepath(filepath: string): AutocompleteLanguageInfo {
  return LANGUAGES[fileExtension(filepath)] ?? Typescript
}
