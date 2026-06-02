import type { RaccoonPluginLanguage } from "@opencode-ai/raccoon-webview"

const messages = {
  en: {
    "raccoon.commands.askFunction.title": "Ask",
    "raccoon.commands.optimizeFunction.title": "Optimize",
    "raccoon.commands.refactorFunction.title": "Refactor",
    "raccoon.commands.commentFunction.title": "Comment",
    "raccoon.functionActions.placeholder": "Choose a Raccoon action",
  },
  "zh-Hans": {
    "raccoon.commands.askFunction.title": "问答",
    "raccoon.commands.optimizeFunction.title": "优化",
    "raccoon.commands.refactorFunction.title": "重构",
    "raccoon.commands.commentFunction.title": "注释",
    "raccoon.functionActions.placeholder": "选择 Raccoon 操作",
  },
  "zh-Hant": {
    "raccoon.commands.askFunction.title": "問答",
    "raccoon.commands.optimizeFunction.title": "最佳化",
    "raccoon.commands.refactorFunction.title": "重構",
    "raccoon.commands.commentFunction.title": "註解",
    "raccoon.functionActions.placeholder": "選擇 Raccoon 操作",
  },
} as const

export function functionActionLabels(language: RaccoonPluginLanguage) {
  const labels = messages[language]
  return {
    ask: labels["raccoon.commands.askFunction.title"],
    optimize: labels["raccoon.commands.optimizeFunction.title"],
    refactor: labels["raccoon.commands.refactorFunction.title"],
    comment: labels["raccoon.commands.commentFunction.title"],
    placeholder: labels["raccoon.functionActions.placeholder"],
  }
}
