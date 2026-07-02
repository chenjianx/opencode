import { useEffect, useState } from "react"
import { MessageList } from "./message-list"
import { PromptInput } from "./prompt-input"
import { HistoryView } from "./history-view"
import { SettingsView } from "./settings/settings-view"
import { useVSCode } from "../context/vscode"
import { useSession } from "../context/session"

export function ChatView() {
  const vscode = useVSCode()
  const session = useSession()
  const [view, setView] = useState<"chat" | "history">("chat")

  useEffect(() => {
    return vscode.onMessage((message) => {
      if (message.type === "showHistory") setView("history")
    })
  }, [vscode])

  if (session.state.view === "settings") return <SettingsView onClose={() => vscode.postMessage({ type: "closeSettings" })} />
  if (view === "history") return <HistoryView onClose={() => setView("chat")} />

  const activeSession = session.state.sessions.find((item) => item.id === session.state.activeSessionID) ?? session.activeSession
  const title =
    activeSession?.title && activeSession.title !== "New session"
      ? activeSession.title
      : session.latestUserMessage?.text || activeSession?.title || "New session"

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--color-background)]">
      <div
        className="shrink-0 overflow-hidden text-ellipsis whitespace-nowrap border-b border-[var(--color-border)] px-[5px] pb-[5px] pt-[7px] text-[13px] font-semibold leading-[18px] text-[var(--color-foreground)]"
        title={title}
      >
        {title}
      </div>
      <MessageList />
      <PromptInput />
    </section>
  )
}
