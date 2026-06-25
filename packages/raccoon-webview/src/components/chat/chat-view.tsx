import { useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, BroomIcon, CaretDownIcon, DatabaseIcon } from "@phosphor-icons/react"
import { MessageList } from "./message-list/message-list"
import { PromptInput } from "./prompt/prompt-input"
import { Popover } from "../ui/popover"
import { sessionUsage, contextTokens, formatTokens, formatCost } from "./message-list/message-list-format"
import { useLanguage } from "../../context/language"
import { useSession } from "../../context/session"

export function ChatView() {
  const language = useLanguage()
  const session = useSession()
  const [usageOpen, setUsageOpen] = useState(false)

  const activeSession = session.state.sessions.find((item) => item.id === session.state.activeSessionID) ?? session.activeSession
  const hasRealTitle = !!activeSession?.title && activeSession.title !== "New session"
  const title = hasRealTitle ? activeSession!.title : session.latestUserMessage?.text || language.t("chat.newSession")
  const usage = sessionUsage(session.visibleMessages)
  const usedCache = usage.cacheRead + usage.cacheWrite

  const contextLimit = session.selectedModel?.contextLimit ?? 0
  const contextUsed = contextTokens(session.visibleMessages)
  const contextPct = contextLimit > 0 ? Math.min(100, Math.round((contextUsed / contextLimit) * 100)) : 0
  const showContext = contextLimit > 0 && contextUsed > 0

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--color-background)]">
      <div className="chat-header">
        <div className="chat-title" title={title}>
          {title}
        </div>
        {session.state.activeSessionID ? (
          <button
            type="button"
            className="chat-header-compact"
            onClick={() => session.runSlashCommand("compact")}
            disabled={session.state.busy}
            title={language.t("message.compactSession")}
            aria-label={language.t("message.compactSession")}
          >
            <BroomIcon className="chat-header-compact-icon" weight="bold" aria-hidden />
          </button>
        ) : null}
        {usage.total > 0 ? (
          <div className="chat-header-usage">
            <span
              className="session-usage-total-inline"
              title={language.t("message.totalTokens", { count: formatTokens(usage.total) })}
            >
              {formatTokens(usage.total)}
            </span>
            <Popover
              open={usageOpen}
              onOpenChange={setUsageOpen}
              className="session-usage-root"
              menuClassName="session-usage-popover"
              portal
              placement="bottom"
              width={220}
              trigger={({ toggle, open }) => (
                <button
                  type="button"
                  className={`session-usage-trigger-btn${open ? " is-open" : ""}`}
                  onClick={toggle}
                  aria-label={language.t("message.usageDetails")}
                >
                  <CaretDownIcon className="session-usage-caret" weight="bold" aria-hidden />
                </button>
              )}
            >
              {() => (
                <>
                  <div className="session-usage-detail">
                    <div className="session-usage-row">
                      <span className="session-usage-row-label">
                        <ArrowUpIcon className="session-usage-icon" weight="bold" aria-hidden />
                        {language.t("message.inputTokenLabel")}
                      </span>
                      <span className="session-usage-value">{formatTokens(usage.input)}</span>
                    </div>
                    <div className="session-usage-row">
                      <span className="session-usage-row-label">
                        <ArrowDownIcon className="session-usage-icon" weight="bold" aria-hidden />
                        {language.t("message.outputTokenLabel")}
                      </span>
                      <span className="session-usage-value">{formatTokens(usage.output)}</span>
                    </div>
                    {usedCache > 0 ? (
                      <div className="session-usage-row">
                        <span className="session-usage-row-label">
                          <DatabaseIcon className="session-usage-icon" weight="bold" aria-hidden />
                          {language.t("message.cacheTokenLabel")}
                        </span>
                        <span className="session-usage-value">{formatTokens(usedCache)}</span>
                      </div>
                    ) : null}
                    <div className="session-usage-row session-usage-row-total">
                      <span className="session-usage-row-label">{language.t("message.totalTokenLabel")}</span>
                      <span className="session-usage-value">{formatTokens(usage.total)}</span>
                    </div>
                    {usage.cost > 0 ? (
                      <div className="session-usage-row">
                        <span className="session-usage-row-label">{language.t("message.costLabel")}</span>
                        <span className="session-usage-value session-usage-cost">{formatCost(usage.cost)}</span>
                      </div>
                    ) : null}
                  </div>
                  {showContext ? (
                    <div className="session-context">
                      <div className="session-context-head">
                        <span className="session-context-title">{language.t("message.contextLabel")}</span>
                        <span className="session-usage-value">
                          {formatTokens(contextUsed)} / {formatTokens(contextLimit)}
                        </span>
                      </div>
                      <div className="session-context-bar">
                        <div
                          className={`session-context-used${contextPct >= 50 ? " session-context-used--hot" : ""}`}
                          style={{ width: `${contextPct}%` }}
                        />
                      </div>
                      <span className="session-context-pct">{contextPct}%</span>
                    </div>
                  ) : null}
                </>
              )}
            </Popover>
          </div>
        ) : null}
      </div>
      <MessageList />
      <PromptInput />
    </section>
  )
}
