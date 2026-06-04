import { useLayoutEffect, useRef, useState } from "react"
import { ArrowDownIcon } from "@phosphor-icons/react"
import { useLanguage } from "../../../context/language"
import { useSession } from "../../../context/session"
import { turns } from "./message-list-model"
import { MessageTurn } from "./message-list-turn"
import { RevertBar } from "./message-list-user"
import { QuestionDock } from "./question-dock"
import { PermissionDock } from "./permission-dock"

function WelcomeState() {
  const { t } = useLanguage()
  return (
    <div className="welcome-state">
      <div className="welcome-card">
        <div className="welcome-top">
          <div className="welcome-mark">R</div>
          <div className="welcome-title">{t("welcome.title")}</div>
        </div>
        <p className="welcome-copy">
          {t("welcome.greetingPrefix")}
          <span className="welcome-mention">@RaccoonEthan</span>
          {t("welcome.greetingSuffix")}
        </p>
        <div className="welcome-tip">
          <span className="welcome-tip-icon">◉</span>
          <span>{t("welcome.tip")}</span>
        </div>
        <ul className="welcome-list">
          <li>{t("welcome.shortcut.invokePrefix")}<kbd>⌘L</kbd>{t("welcome.shortcut.invokeSuffix")}</li>
          <li>{t("welcome.shortcut.contextPrefix")}<kbd>@</kbd>{t("welcome.shortcut.contextSuffix")}</li>
          <li>{t("welcome.shortcut.commandsPrefix")}<kbd>/</kbd>{t("welcome.shortcut.commandsSuffix")}</li>
        </ul>
        <p className="welcome-footer">
          {t("welcome.footerPrefix")}
          <a href="#" onClick={(event) => event.preventDefault()}>{t("welcome.footerLink")}</a>
          {t("welcome.footerSuffix")}
        </p>
      </div>
    </div>
  )
}

export function MessageList() {
  const language = useLanguage()
  const session = useSession()
  const messageTurns = turns(session.visibleMessages)
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
    const root = rootRef.current
    if (!root) return
    if (!followBottomRef.current) {
      updateScrollButton()
      return
    }
    root.scrollTo({ top: root.scrollHeight, behavior: "auto" })
    setShowScrollBottom(false)
    followBottomRef.current = true
  }, [session.messages, session.state.loading])

  const scrollToBottom = () => {
    const root = rootRef.current
    if (!root) return
    root.scrollTo({ top: root.scrollHeight, behavior: "smooth" })
    setShowScrollBottom(false)
    followBottomRef.current = true
  }

  const inlineQuestions = session.questions.filter((request) => !!request.tool?.messageID)
  const floatingQuestions = session.questions.filter((request) => !request.tool?.messageID)
  // Show permission prompts one at a time — the rest queue behind the active one.
  const activePermission = session.permissions[0]

  return (
    <div className="message-list-shell">
      <div className="message-list" ref={rootRef} onScroll={updateScrollButton}>
        {session.state.error ? <div className="message-shell error">{session.state.error}</div> : null}
        {!session.state.activeSessionID && !session.state.loading && session.messages.length === 0 ? <WelcomeState /> : null}
        {messageTurns.map((turn, index) => (
          <MessageTurn key={turn.user?.id ?? turn.assistant[0]?.id ?? index} turn={turn} session={session} inlineQuestions={inlineQuestions} />
        ))}
        {session.revertedMessages.length > 0 ? <RevertBar items={session.revertedMessages} /> : null}
        {session.state.loading ? (
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
