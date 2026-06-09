/**
 * Language metadata for autocomplete, ported as a subset from continue-rac
 * (core/autocomplete/constants/AutocompleteLanguageInfo.ts). Only the fields the
 * prefix/suffix pipeline consumes are kept: name, singleLineComment, endOfLine,
 * and useMultiline. charFilters/lineFilters are intentionally omitted (no
 * language-specific stream filters in this variant).
 */

export interface AutocompleteLanguageInfo {
  name: string
  singleLineComment?: string
  endOfLine: string[]
  useMultiline?: (args: { prefix: string; suffix: string }) => boolean
}

const Typescript: AutocompleteLanguageInfo = { name: "TypeScript", singleLineComment: "//", endOfLine: [";"] }
const Python: AutocompleteLanguageInfo = { name: "Python", singleLineComment: "#", endOfLine: [] }
const Java: AutocompleteLanguageInfo = { name: "Java", singleLineComment: "//", endOfLine: [";"] }
const Cpp: AutocompleteLanguageInfo = { name: "C++", singleLineComment: "//", endOfLine: [";"] }
const CSharp: AutocompleteLanguageInfo = { name: "C#", singleLineComment: "//", endOfLine: [";"] }
const C: AutocompleteLanguageInfo = { name: "C", singleLineComment: "//", endOfLine: [";"] }
const Scala: AutocompleteLanguageInfo = { name: "Scala", singleLineComment: "//", endOfLine: [";"] }
const Go: AutocompleteLanguageInfo = { name: "Go", singleLineComment: "//", endOfLine: [] }
const Rust: AutocompleteLanguageInfo = { name: "Rust", singleLineComment: "//", endOfLine: [";"] }
const Haskell: AutocompleteLanguageInfo = { name: "Haskell", singleLineComment: "--", endOfLine: [] }
const PHP: AutocompleteLanguageInfo = { name: "PHP", singleLineComment: "//", endOfLine: [";"] }
const Swift: AutocompleteLanguageInfo = { name: "Swift", singleLineComment: "//", endOfLine: [";"] }
const Kotlin: AutocompleteLanguageInfo = { name: "Kotlin", singleLineComment: "//", endOfLine: [";"] }
const Ruby: AutocompleteLanguageInfo = { name: "Ruby", singleLineComment: "#", endOfLine: [] }
const Clojure: AutocompleteLanguageInfo = { name: "Clojure", singleLineComment: ";", endOfLine: [] }
const Julia: AutocompleteLanguageInfo = { name: "Julia", singleLineComment: "#", endOfLine: [";"] }
const FSharp: AutocompleteLanguageInfo = { name: "F#", singleLineComment: "//", endOfLine: [] }
const R: AutocompleteLanguageInfo = { name: "R", singleLineComment: "#", endOfLine: [] }
const Dart: AutocompleteLanguageInfo = { name: "Dart", singleLineComment: "//", endOfLine: [";"] }
const Solidity: AutocompleteLanguageInfo = { name: "Solidity", singleLineComment: "//", endOfLine: [";"] }
const Lua: AutocompleteLanguageInfo = { name: "Lua", singleLineComment: "--", endOfLine: [] }
const YAML: AutocompleteLanguageInfo = { name: "YAML", singleLineComment: "#", endOfLine: [] }
const Json: AutocompleteLanguageInfo = { name: "JSON", singleLineComment: "//", endOfLine: [",", "}", "]"] }
const Markdown: AutocompleteLanguageInfo = {
  name: "Markdown",
  singleLineComment: "",
  endOfLine: [],
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
