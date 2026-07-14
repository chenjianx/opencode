import { ArrowLeftIcon } from "@phosphor-icons/react"
import { MessageList } from "./message-list/message-list"
import { Button } from "../ui"
import { useLanguage } from "../../context/language"
import { useSession } from "../../context/session"

export function SubAgentView() {
  const language = useLanguage()
  const session = useSession()
  const view = session.state.subAgentView
  const title = view?.title?.trim() || language.t("subagent.title")

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--color-background)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-[5px] pb-[6px] pt-[7px]">
        <Button
          variant="ghost"
          className="ui-button--small gap-1 px-2 text-[12px] font-medium text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          onClick={() => session.closeSubAgent()}
          aria-label={language.t("subagent.back")}
          icon={<ArrowLeftIcon size={14} weight="bold" />}
        >
          {language.t("subagent.back")}
        </Button>
        <span className="h-[16px] w-px shrink-0 bg-[var(--color-border)]" />
        <div
          className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold leading-[18px] text-[var(--color-foreground)]"
          title={title}
        >
          {title}
        </div>
      </div>
      {view?.error ? (
        <div className="message-shell error">{view.error}</div>
      ) : view?.loading && (view?.messages.length ?? 0) === 0 ? (
        <div className="working-indicator">
          <span className="working-dot" />
          <span>{language.t("message.working")}</span>
        </div>
      ) : (
        <MessageList messages={view?.messages ?? []} readonly follow busy={view?.busy} sessionID={view?.sessionID} />
      )}
    </section>
  )
}
