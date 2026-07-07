import type { RaccoonSlashCommand } from "@opencode-ai/raccoon-webview"

export function uiSlashCommands(): RaccoonSlashCommand[] {
  return [
    { name: "sessions", aliases: ["resume", "continue"], description: "Switch session", source: "ui", mode: "action" },
    { name: "new", aliases: ["clear"], description: "New session", source: "ui", mode: "action" },
    { name: "settings", description: "Open settings", source: "ui", mode: "action" },
    { name: "compact", aliases: ["summarize"], description: "Summarize this session", source: "ui", mode: "action" },
    { name: "undo", description: "Undo previous user message", source: "ui", mode: "action" },
  ]
}
