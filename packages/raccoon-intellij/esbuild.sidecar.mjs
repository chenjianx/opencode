import esbuild from "esbuild"

const production = process.argv.includes("--production")

await esbuild.build({
  entryPoints: ["sidecar/index.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  minify: production,
  sourcemap: !production,
  outfile: "src/main/resources/sidecar/sidecar.cjs",
  // The opencode server is spawned as a child process (bin/raccoon); nothing
  // from the SDK's optional native deps needs bundling here. Keep node builtins
  // external so the CJS output runs under the host's plain `node`.
  logLevel: "info",
})
