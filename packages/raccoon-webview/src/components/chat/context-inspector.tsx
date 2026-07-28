import { useEffect, useRef, useState } from "react"
import { ArrowClockwiseIcon } from "@phosphor-icons/react"
import type { RaccoonContextInspectorSnapshot } from "../../protocol"
import { useLanguage } from "../../context/language"
import { useSessionActions, useSessionState } from "../../context/session"
import { Button } from "../ui/button"
import { Dialog } from "../ui/dialog"
import { formatCost, formatTokens } from "./message-list/message-list-format"

export function ContextInspector(props: { sessionID: string; onClose: () => void }) {
  const language = useLanguage()
  const session = useSessionState()
  const actions = useSessionActions()
  const generation = useRef(0)
  const [result, setResult] = useState<{
    loading: boolean
    snapshot?: RaccoonContextInspectorSnapshot
    error?: string
  }>({ loading: true })

  const load = () => {
    const request = ++generation.current
    setResult((current) => ({ ...current, loading: true, error: undefined }))
    void actions.requestContextInspector(props.sessionID).then((next) => {
      if (request !== generation.current) return
      setResult({ loading: false, ...next })
    })
  }

  useEffect(() => {
    load()
    return () => {
      generation.current++
    }
  }, [props.sessionID])

  const snapshot = result.snapshot
  const model = snapshot?.model
    ? session.models.find(
        (item) => item.providerID === snapshot.model?.providerID && item.modelID === snapshot.model.modelID,
      )
    : undefined
  const usage = snapshot?.usage
  const usageTotal = usage
    ? typeof usage.total === "number" && usage.total > 0
      ? usage.total
      : usage.input + usage.output + usage.reasoning + usage.cache.read + usage.cache.write
    : 0
  const contextLimit = model?.contextLimit ?? 0
  const contextPercent = contextLimit > 0 ? Math.min(100, Math.round((usageTotal / contextLimit) * 100)) : 0

  return (
    <Dialog
      titleId="context-inspector-title"
      title={language.t("contextInspector.title")}
      subtitle={language.t("contextInspector.subtitle")}
      onClose={props.onClose}
      className="context-inspector-dialog"
      bodyClassName="context-inspector-body"
      footer={
        <Button
          variant="small"
          icon={<ArrowClockwiseIcon size={13} weight="bold" aria-hidden />}
          onClick={load}
          disabled={result.loading}
        >
          {language.t("contextInspector.refresh")}
        </Button>
      }
      footerClassName="context-inspector-footer"
    >
      {result.loading && !snapshot ? <div className="context-inspector-state">{language.t("contextInspector.loading")}</div> : null}
      {result.error ? (
        <div className="context-inspector-state context-inspector-error">
          <span>{language.t("contextInspector.error")}</span>
          <code>{result.error}</code>
        </div>
      ) : null}
      {snapshot ? (
        <>
          <div className="context-inspector-notice">{language.t("contextInspector.estimatedNotice")}</div>
          {snapshot.truncated ? (
            <div className="context-inspector-notice context-inspector-notice--warning">
              {language.t("contextInspector.truncated")}
            </div>
          ) : null}

          <section className="context-inspector-section">
            <h3>{language.t("contextInspector.overview")}</h3>
            <div className="context-inspector-metrics">
              <Metric label={language.t("contextInspector.session")} value={snapshot.session.title || snapshot.session.id} />
              <Metric label={language.t("contextInspector.messageCount")} value={snapshot.messages.length.toLocaleString()} />
              <Metric
                label={language.t("contextInspector.provider")}
                value={model?.providerName ?? snapshot.model?.providerID ?? language.t("contextInspector.unavailable")}
              />
              <Metric
                label={language.t("contextInspector.model")}
                value={model?.modelName ?? snapshot.model?.modelID ?? language.t("contextInspector.unavailable")}
              />
              <Metric
                label={language.t("contextInspector.contextLimit")}
                value={contextLimit > 0 ? formatTokens(contextLimit) : language.t("contextInspector.unavailable")}
              />
              <Metric
                label={language.t("message.totalTokenLabel")}
                value={usage ? formatTokens(usageTotal) : language.t("contextInspector.unavailable")}
              />
              <Metric label={language.t("message.inputTokenLabel")} value={formatTokens(usage?.input ?? 0)} />
              <Metric label={language.t("message.outputTokenLabel")} value={formatTokens(usage?.output ?? 0)} />
              <Metric label={language.t("message.reasoningTokenLabel")} value={formatTokens(usage?.reasoning ?? 0)} />
              <Metric
                label={language.t("message.cacheTokenLabel")}
                value={`${formatTokens(usage?.cache.read ?? 0)} / ${formatTokens(usage?.cache.write ?? 0)}`}
              />
              <Metric label={language.t("message.costLabel")} value={formatCost(snapshot.session.cost)} />
              <Metric
                label={language.t("contextInspector.contextUsage")}
                value={contextLimit > 0 ? `${contextPercent}%` : language.t("contextInspector.unavailable")}
              />
              <Metric
                label={language.t("contextInspector.created")}
                value={new Date(snapshot.session.createdAt).toLocaleString()}
              />
              <Metric
                label={language.t("contextInspector.updated")}
                value={new Date(snapshot.session.updatedAt).toLocaleString()}
              />
            </div>
          </section>

          {snapshot.breakdown.length > 0 ? (
            <section className="context-inspector-section">
              <h3>{language.t("contextInspector.breakdown")}</h3>
              <div className="context-inspector-breakdown-bar" aria-hidden>
                {snapshot.breakdown.map((segment) => (
                  <span
                    key={segment.key}
                    className={`context-inspector-breakdown-segment context-inspector-breakdown-segment--${segment.key}`}
                    style={{ width: `${segment.percent}%` }}
                  />
                ))}
              </div>
              <div className="context-inspector-breakdown-legend">
                {snapshot.breakdown.map((segment) => (
                  <div key={segment.key}>
                    <span className={`context-inspector-dot context-inspector-dot--${segment.key}`} />
                    <span>{language.t(`contextInspector.breakdown.${segment.key}`)}</span>
                    <strong>{segment.percent}%</strong>
                    <code>{formatTokens(segment.tokens)}</code>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {snapshot.systemPrompt ? (
            <section className="context-inspector-section">
              <h3>{language.t("contextInspector.systemPrompt")}</h3>
              <pre className="context-inspector-code context-inspector-system">{snapshot.systemPrompt}</pre>
            </section>
          ) : null}

          <section className="context-inspector-section">
            <h3>{language.t("contextInspector.rawMessages")}</h3>
            {snapshot.messages.length > 0 ? (
              <div className="context-inspector-messages">
                {snapshot.messages.map((message) => (
                  <details key={message.id} className="context-inspector-message">
                    <summary>
                      <span>{message.role}</span>
                      <code>{message.id}</code>
                      <time>{new Date(message.createdAt).toLocaleString()}</time>
                    </summary>
                    <pre className="context-inspector-code">{message.raw}</pre>
                  </details>
                ))}
              </div>
            ) : (
              <div className="context-inspector-state">{language.t("contextInspector.empty")}</div>
            )}
          </section>
        </>
      ) : null}
    </Dialog>
  )
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="context-inspector-metric">
      <span>{props.label}</span>
      <strong title={props.value}>{props.value}</strong>
    </div>
  )
}
