import type { EditorContextAction } from "@opencode-ai/raccoon-core"

// Single source of truth for the editor action vocabulary. Both entry points — the
// editor context submenu (declared in package.json) and the function CodeLens QuickPick
// (built at runtime in extension.ts) — reuse this same ordered list, so the user only
// has to learn one set of verbs. Keep the order and command ids in sync with the
// `raccoon.editorContextMenu` submenu and the `%raccoon.commands.*.title%` nls keys.

export type EditorActionId = "explainCode" | "fixCode" | "improveCode" | "refactorCode" | "commentCode" | "addToContext"

type EditorAction = {
  id: EditorActionId
  command: string
  type: EditorContextAction
  // "send" fires a chat message immediately; "append" only inserts the context into the
  // chat input for the user to keep composing.
  mode: "send" | "append"
  // Which entry points surface this action. The vocabulary is unified, but each entry only
  // shows the subset that fits it: the right-click submenu stays lean (quick actions on a
  // selection), while Refactor/Comment live on the function CodeLens where they apply best.
  // `menu` mirrors the `raccoon.editorContextMenu` submenu declared in package.json (which
  // VSCode requires to be static) — keep the two in sync. `lens` is consumed at runtime to
  // build the CodeLens QuickPick.
  menu: boolean
  lens: boolean
}

export const EDITOR_ACTIONS: readonly EditorAction[] = [
  { id: "explainCode", command: "raccoon.explainCode", type: "EXPLAIN", mode: "send", menu: true, lens: true },
  { id: "fixCode", command: "raccoon.fixCode", type: "FIX", mode: "send", menu: true, lens: true },
  { id: "improveCode", command: "raccoon.improveCode", type: "IMPROVE", mode: "send", menu: true, lens: true },
  { id: "refactorCode", command: "raccoon.refactorCode", type: "REFACTOR", mode: "send", menu: false, lens: true },
  { id: "commentCode", command: "raccoon.commentCode", type: "COMMENT", mode: "send", menu: false, lens: true },
  { id: "addToContext", command: "raccoon.addToContext", type: "ADD_TO_CONTEXT", mode: "append", menu: true, lens: false },
]
