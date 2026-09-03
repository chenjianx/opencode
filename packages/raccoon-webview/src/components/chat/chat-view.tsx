import { useState } from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsInLineVerticalIcon,
  BrainIcon,
  DatabaseIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react"
import { MessageList } from "./message-list/message-list"
import { PromptInput } from "./prompt/prompt-input"
import { Popover } from "../ui/popover"
import { sessionUsage, contextTokens, contextBreakdown, formatTokens, formatCost } from "./message-list/message-list-format"
import { useLanguage } from "../../context/language"
import { useSession } from "../../context/session"
import { ContextInspector } from "./context-inspector"

export function ChatView() {
  const language = useLanguage()
  const session = useSession()
  const [usageOpen, setUsageOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)

  const activeSession = session.state.sessions.find((item) => item.id === session.state.activeSessionID) ?? session.activeSession
  const isDefaultTitle = (value?: string) =>
    !value || value === "New session" || /^New session - \d{4}-\d{2}-\d{2}T/.test(value)
  const hasRealTitle = !isDefaultTitle(activeSession?.title)
  const title = hasRealTitle ? activeSession!.title : session.latestUserMessage?.text || ""
  const usage = sessionUsage(session.visibleMessages)
  const breakdown = contextBreakdown(session.visibleMessages)

  const contextLimit = session.conversationModel?.contextLimit ?? 0
  const contextUsed = contextTokens(session.visibleMessages)
  const contextPct = contextLimit > 0 ? Math.min(100, Math.round((contextUsed / contextLimit) * 100)) : 0
  const showContext = contextLimit > 0 && contextUsed > 0

  return (
    <section className="chat-view flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--color-background)]">
      <div className="chat-header">
        <div className="chat-title" title={title}>
          {title}
        </div>
        {usage.total > 0 ? (
          <span
            className="session-usage-total-inline ui-tip ui-tip-bottom"
            data-tip={
              showContext
                ? language.t("message.contextUsage", {
                    used: formatTokens(contextUsed),
                    limit: formatTokens(contextLimit),
                    pct: contextPct,
                  })
                : language.t("message.contextLabel")
            }
          >
            {showContext ? `${contextPct}%` : formatTokens(contextUsed)}
          </span>
        ) : null}
        {session.state.activeSessionID ? (
          <button
            type="button"
            className="chat-header-compact ui-tip ui-tip-bottom"
            onClick={() => session.runSlashCommand("compact")}
            disabled={session.state.busy}
            data-tip={language.t("message.compactSession")}
            aria-label={language.t("message.compactSession")}
          >
            <ArrowsInLineVerticalIcon className="chat-header-compact-icon" weight="regular" aria-hidden />
          </button>
        ) : null}
        {usage.total > 0 ? (
          <div className="chat-header-usage">
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
                  className={`session-usage-trigger-btn ui-tip ui-tip-bottom${open ? " is-open" : ""}`}
                  onClick={toggle}
                  data-tip={language.t("message.usageDetails")}
                  aria-label={language.t("message.usageDetails")}
                >
                  <ContextRing pct={contextPct} hot={contextPct >= 50} />
                </button>
              )}
            >
              {() => (
                <>
                  <div className="session-usage-detail">
                    {breakdown.input > 0 ? (
                      <div className="session-usage-row">
                        <span className="session-usage-row-label">
                          <ArrowUpIcon className="session-usage-icon" weight="bold" aria-hidden />
                          {language.t("message.inputTokenLabel")}
                        </span>
                        <span className="session-usage-value">{formatTokens(breakdown.input)}</span>
                      </div>
                    ) : null}
                    {breakdown.cache > 0 ? (
                      <div className="session-usage-row">
                        <span className="session-usage-row-label">
                          <DatabaseIcon className="session-usage-icon" weight="bold" aria-hidden />
                          {language.t("message.cacheTokenLabel")}
                        </span>
                        <span className="session-usage-value">{formatTokens(breakdown.cache)}</span>
                      </div>
                    ) : null}
                    {breakdown.reasoning > 0 ? (
                      <div className="session-usage-row">
                        <span className="session-usage-row-label">
                          <BrainIcon className="session-usage-icon" weight="bold" aria-hidden />
                          {language.t("message.reasoningTokenLabel")}
                        </span>
                        <span className="session-usage-value">{formatTokens(breakdown.reasoning)}</span>
                      </div>
                    ) : null}
                    {breakdown.output > 0 ? (
                      <div className="session-usage-row">
                        <span className="session-usage-row-label">
                          <ArrowDownIcon className="session-usage-icon" weight="bold" aria-hidden />
                          {language.t("message.outputTokenLabel")}
                        </span>
                        <span className="session-usage-value">{formatTokens(breakdown.output)}</span>
                      </div>
                    ) : null}
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
                  <button
                    type="button"
                    className="context-inspector-open"
                    onClick={() => {
                      setUsageOpen(false)
                      setInspectorOpen(true)
                    }}
                  >
                    <MagnifyingGlassIcon size={13} weight="bold" aria-hidden />
                    {language.t("contextInspector.open")}
                  </button>
                </>
              )}
            </Popover>
          </div>
        ) : null}
      </div>
      {inspectorOpen && session.state.activeSessionID ? (
        <ContextInspector sessionID={session.state.activeSessionID} onClose={() => setInspectorOpen(false)} />
      ) : null}
      <MessageList />
      <PromptInput />
    </section>
  )
}

// Stroke ring whose fill encodes how full the context window is.
function ContextRing({ pct, hot }: { pct: number; hot: boolean }) {
  const radius = 6
  const circumference = 2 * Math.PI * radius
  return (
    <svg className="session-usage-ring" viewBox="0 0 16 16" aria-hidden>
      <circle className="session-usage-ring-track" cx="8" cy="8" r={radius} fill="none" />
      <circle
        className={`session-usage-ring-fill${hot ? " session-usage-ring-fill--hot" : ""}`}
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.max(0, Math.min(100, pct)) / 100)}
        strokeLinecap="round"
        transform="rotate(-90 8 8)"
      />
    </svg>
  )
}
