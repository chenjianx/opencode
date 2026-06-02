const esbuild = require("esbuild")

const production = process.argv.includes("--production")
const watch = process.argv.includes("--watch")

const problemMatcherPlugin = {
  name: "problem-matcher",
  setup(build) {
    build.onStart(() => console.log("[watch] build started"))
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`)
        if (location) console.error(`    ${location.file}:${location.line}:${location.column}:`)
      })
      console.log("[watch] build finished")
    })
  },
}

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: true,
    sourcesContent: true,
    platform: "node",
    outfile: "dist/extension.cjs",
    external: [
      "@tree-sitter-grammars/tree-sitter-kotlin",
      "vscode",
      "tree-sitter",
      "tree-sitter-bash",
      "tree-sitter-c",
      "tree-sitter-c-sharp",
      "tree-sitter-cpp",
      "tree-sitter-dart",
      "tree-sitter-go",
      "tree-sitter-java",
      "tree-sitter-javascript",
      "tree-sitter-lua",
      "tree-sitter-objc",
      "tree-sitter-php",
      "tree-sitter-python",
      "tree-sitter-powershell",
      "tree-sitter-ruby",
      "tree-sitter-rust",
      "tree-sitter-scala",
      "tree-sitter-swift",
      "tree-sitter-typescript",
    ],
    logLevel: "silent",
    plugins: [problemMatcherPlugin],
  })

  if (watch) {
    await ctx.watch()
    return
  }

  await ctx.rebuild()
  await ctx.dispose()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
