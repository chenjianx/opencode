# Raccoon Webview

## Development

```bash
bun install
bun run --cwd packages/raccoon-webview dev
```

## Build

```bash
bun run --cwd packages/raccoon-webview build
```

The build output is written into `packages/raccoon-vscode/dist/webview`.

## Purpose

This package only holds the webview UI and the message protocol used by the VS Code extension.
