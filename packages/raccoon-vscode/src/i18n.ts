import type { RaccoonPluginLanguage } from "@opencode-ai/raccoon-webview"
import type { EditorActionId } from "./actions.js"

// Runtime labels for the function-CodeLens QuickPick. The editor context submenu reads its
// labels from package.nls*.json instead; keep the wording here word-for-word identical to
// those nls entries so both entry points present the exact same verb table.

type ActionMessages = Record<EditorActionId, string> & { placeholder: string }

const messages: Record<RaccoonPluginLanguage, ActionMessages> = {
  en: {
    explainCode: "Explain",
    fixCode: "Fix",
    improveCode: "Improve",
    refactorCode: "Refactor",
    commentCode: "Comment",
    addToContext: "Add to Context",
    placeholder: "Choose a Raccoon action",
  },
  "zh-Hans": {
    explainCode: "解释",
    fixCode: "修复",
    improveCode: "优化",
    refactorCode: "重构",
    commentCode: "注释",
    addToContext: "添加到上下文",
    placeholder: "选择 Raccoon 操作",
  },
  "zh-Hant": {
    explainCode: "解釋",
    fixCode: "修復",
    improveCode: "最佳化",
    refactorCode: "重構",
    commentCode: "註解",
    addToContext: "加入到內容",
    placeholder: "選擇 Raccoon 操作",
  },
}

export function actionLabels(language: RaccoonPluginLanguage) {
  return messages[language]
}
