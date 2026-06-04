import { MessageList } from "./message-list/message-list"
import { PromptInput } from "./prompt/prompt-input"
import { useLanguage } from "../../context/language"
import { useSession } from "../../context/session"

export function ChatView() {
  const language = useLanguage()
  const session = useSession()

  const activeSession = session.state.sessions.find((item) => item.id === session.state.activeSessionID) ?? session.activeSession
  const hasRealTitle = !!activeSession?.title && activeSession.title !== "New session"
  const title = hasRealTitle ? activeSession!.title : session.latestUserMessage?.text || language.t("chat.newSession")

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
