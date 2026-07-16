# Raccoon VS Code

## Run locally

1. Install dependencies at repo root:

```bash
bun install
```

2. Build the webview once:

```bash
bun run --cwd packages/raccoon-vscode build:webview
```

3. Start the extension build watcher:

```bash
bun run --cwd packages/raccoon-vscode dev
```

`dev` first ensures the local Raccoon CLI exists at `packages/raccoon-vscode/bin/raccoon`.

4. Open the repo root in VS Code.

5. Run `Raccoon: Launch Extension` from the Debug panel, or press `F5` after selecting it.

6. In the extension host window, open the Raccoon sidebar.

## Debug Webview Source

The default local flow loads the built webview from `dist/webview`, which can make VS Code DevTools show compiled code even when sourcemaps exist. For source-level debugging, run the webview through Vite:

```bash
bun run --cwd packages/raccoon-webview dev
```

Then start the VS Code extension watcher with the dev server URL:

```bash
RACCOON_WEBVIEW_DEV_SERVER=http://127.0.0.1:5173 bun run --cwd packages/raccoon-vscode dev
```

Launch the extension host from VS Code as usual. The webview will load `packages/raccoon-webview/src/main.tsx` from Vite, so DevTools should show files under `packages/raccoon-webview/src`.

## Config

- `raccoon.serverUrl`: use an existing Raccoon server instead of starting one
- `raccoon.opencodeCommand`: fallback command used only when `bin/raccoon` is missing

## CLI Binary

The extension follows Kilo's model and prefers its bundled CLI:

```text
packages/raccoon-vscode/bin/raccoon
```

Rebuild or refresh it with:

```bash
bun run --cwd packages/raccoon-vscode build:cli
```

Force a rebuild:

```bash
bun run --cwd packages/raccoon-vscode build:cli -- --force
```

At runtime the extension spawns:

```bash
bin/raccoon serve --port <random-port> --hostname 127.0.0.1
```

## Commands

- `Raccoon: Open Chat`
- `Raccoon: New Session`
