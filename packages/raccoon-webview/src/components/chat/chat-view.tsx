import { MessageList } from "./message-list/message-list"
import { PromptInput } from "./prompt-input"
import { HistoryView } from "../history/history-view"
import { SettingsView } from "../settings/settings-view"
import { useSession } from "../../context/session"

export function ChatView() {
  const session = useSession()

  if (session.state.view === "settings") return <SettingsView />
  if (session.state.view === "history") return <HistoryView onClose={() => session.showChat()} />

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
