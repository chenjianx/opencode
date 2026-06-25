import { useLayoutEffect, useRef, useState } from "react"
import { ArrowDownIcon } from "@phosphor-icons/react"
import type { RaccoonMessage } from "../../../protocol"
import { useLanguage } from "../../../context/language"
import { useSession } from "../../../context/session"
import { turns } from "./message-list-model"
import { MessageTurn } from "./message-list-turn"
import { RevertBar } from "./message-list-user"
import { QuestionDock } from "./question-dock"
import { PermissionDock } from "./permission-dock"

export function MessageList(props: { messages?: RaccoonMessage[]; readonly?: boolean } = {}) {
  const language = useLanguage()
  const session = useSession()
  const readonly = props.readonly ?? false
  const messageTurns = turns(props.messages ?? session.visibleMessages)
  const rootRef = useRef<HTMLDivElement>(null)
  const followBottomRef = useRef(true)
  const [showScrollBottom, setShowScrollBottom] = useState(false)

  const updateScrollButton = () => {
    const root = rootRef.current
    if (!root) return
    const atBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 48
    followBottomRef.current = atBottom
    setShowScrollBottom(!atBottom)
  }

  useLayoutEffect(() => {
    // Read-only views (e.g. the sub-agent viewer) are for reviewing a finished
    // conversation — keep the scroll at the top instead of jumping to the bottom.
    if (readonly) return
    const root = rootRef.current
    if (!root) return
    if (!followBottomRef.current) {
      updateScrollButton()
      return
    }
    root.scrollTo({ top: root.scrollHeight, behavior: "auto" })
    setShowScrollBottom(false)
    followBottomRef.current = true
  }, [readonly, props.messages, session.messages, session.state.loading])

  const scrollToBottom = () => {
    const root = rootRef.current
    if (!root) return
    root.scrollTo({ top: root.scrollHeight, behavior: "smooth" })
    setShowScrollBottom(false)
    followBottomRef.current = true
  }

  const inlineQuestions = readonly ? [] : session.questions.filter((request) => !!request.tool?.messageID)
  const floatingQuestions = readonly ? [] : session.questions.filter((request) => !request.tool?.messageID)
  // Show permission prompts one at a time — the rest queue behind the active one.
  const activePermission = readonly ? undefined : session.permissions[0]

  return (
    <div className="message-list-shell">
      <div className="message-list" ref={rootRef} onScroll={updateScrollButton}>
        {!readonly && session.state.error ? <div className="message-shell error">{session.state.error}</div> : null}
        {messageTurns.map((turn, index) => (
          <MessageTurn
            key={turn.user?.id ?? turn.assistant[0]?.id ?? index}
            turn={turn}
            session={session}
            inlineQuestions={inlineQuestions}
            readonly={readonly}
          />
        ))}
        {!readonly && session.revertedMessages.length > 0 ? <RevertBar items={session.revertedMessages} /> : null}
        {!readonly && session.state.loading ? (
          <div className="working-indicator">
            <span className="working-dot" />
            <span>{language.t("message.working")}</span>
          </div>
        ) : null}
        {floatingQuestions.map((request) => (
          <QuestionDock key={request.id} request={request} />
        ))}
        {activePermission ? (
          <PermissionDock key={activePermission.id} request={activePermission} remaining={session.permissions.length - 1} />
        ) : null}
      </div>
      {showScrollBottom ? (
        <button
          type="button"
          className="message-scroll-bottom"
          onClick={scrollToBottom}
          aria-label={language.t("message.scrollToBottom")}
        >
          <ArrowDownIcon size={18} weight="bold" />
        </button>
      ) : null}
    </div>
  )
}
