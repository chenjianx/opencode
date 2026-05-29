import { useEffect, useMemo, useRef, useState } from "react"
import { CaretLeft, CaretRight, Check, X } from "@phosphor-icons/react"
import { useLanguage } from "../context/language"
import { useSession } from "../context/session"
import type { RaccoonQuestionRequest } from "../protocol"

type Translate = ReturnType<typeof useLanguage>["t"]

function tr(translate: Translate, key: string | undefined, fallback: string) {
  if (!key) return fallback
  const result = translate(key as Parameters<Translate>[0])
  if (result === key) return fallback
  return result
}

export function QuestionDock(props: { request: RaccoonQuestionRequest }) {
  const session = useSession()
  const language = useLanguage()
  const rootRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState(0)
  const [answers, setAnswers] = useState<string[][]>([])
  const [custom, setCustom] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [sending, setSending] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const questions = props.request.questions
  const single = questions.length === 1 && questions[0]?.multiple !== true
  const question = questions[tab]
  const options = question?.options ?? []
  const multi = question?.multiple === true
  const input = custom[tab] ?? ""
  const customEnabled = question?.custom !== false
  const review = !single && tab === questions.length
  const summary = useMemo(() => {
    const n = Math.min(tab + 1, questions.length)
    return language.t("question.summary", { n, total: questions.length })
  }, [language, questions.length, tab])

  const submit = () => {
    if (sending) return
    setSending(true)
    session.replyToQuestion(props.request.id, answers)
  }

  const reject = () => {
    if (sending) return
    setSending(true)
    session.rejectQuestion(props.request.id)
  }

  const updateAnswer = (answer: string, customAnswer = false) => {
    const nextAnswers = [...answers]
    nextAnswers[tab] = [answer]
    setAnswers(nextAnswers)
    if (customAnswer) {
      const nextCustom = [...custom]
      nextCustom[tab] = answer
      setCustom(nextCustom)
    }
  }

  const clearCustomAnswer = () => {
    const nextAnswers = [...answers]
    nextAnswers[tab] = []
    setAnswers(nextAnswers)
    const nextCustom = [...custom]
    nextCustom[tab] = ""
    setCustom(nextCustom)
    setEditing(false)
  }

  const selectOption = (index: number) => {
    if (sending || review) return
    if (index === options.length) {
      setEditing(true)
      return
    }
    const option = options[index]
    if (!option) return
    if (multi) {
      const next = [...(answers[tab] ?? [])]
      const pos = next.indexOf(option.label)
      if (pos === -1) next.push(option.label)
      else next.splice(pos, 1)
      const nextAnswers = [...answers]
      nextAnswers[tab] = next
      setAnswers(nextAnswers)
      return
    }
    updateAnswer(option.label)
    if (single) return
    setTab((current) => current + 1)
  }

  const onRoot = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      if (editing) {
        setEditing(false)
        return
      }
      reject()
      return
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      event.stopPropagation()
      if (sending) return
      if (!review && !single && (answers[tab]?.length ?? 0) === 0) return
      submit()
    }
  }

  useEffect(() => {
    if (collapsed || editing || review) return
    requestAnimationFrame(() => {
      if (!document.hasFocus()) return
      rootRef.current?.querySelector<HTMLButtonElement>("button[data-slot='question-option']:not(:disabled)")?.focus({
        preventScroll: true,
      })
    })
  }, [collapsed, editing, review, tab])

  const customPicked = !!input && (answers[tab] ?? []).includes(input)

  const handleCustomSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (sending) return
    const value = input.trim()
    if (!value) {
      setEditing(false)
      return
    }
    if (multi) {
      const nextAnswers = [...answers]
      const current = nextAnswers[tab] ?? []
      nextAnswers[tab] = current.includes(value) ? current : [...current, value]
      setAnswers(nextAnswers)
      setEditing(false)
      return
    }
    updateAnswer(value, true)
    setEditing(false)
    if (!single) setTab((current) => current + 1)
  }

  return (
    <div
      ref={rootRef}
      className="question-dock"
      data-collapsed={collapsed ? "true" : "false"}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={onRoot}
    >
      <div className="question-dock-head" onClick={() => setCollapsed((value) => !value)}>
        <div className="question-dock-head-content">
          <div className="question-dock-title">{summary}</div>
          {collapsed ? <div className="question-dock-collapsed">{tr(language.t, question?.questionKey, question?.question ?? "")}</div> : null}
        </div>
        <div className="question-dock-head-actions" onClick={(event) => event.stopPropagation()}>
          {!collapsed && !single ? (
            <div className="question-dock-nav">
              <button type="button" className="question-dock-nav-btn" disabled={sending || tab <= 0} onClick={() => setTab((value) => value - 1)}>
                <CaretLeft size={14} weight="bold" />
              </button>
              <button
                type="button"
                className="question-dock-nav-btn"
                disabled={sending || tab >= questions.length || (!review && (answers[tab]?.length ?? 0) === 0)}
                onClick={() => setTab((value) => value + 1)}
              >
                <CaretRight size={14} weight="bold" />
              </button>
            </div>
          ) : null}
          <button type="button" className="question-dock-collapse" onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? "+" : "-"}
          </button>
        </div>
      </div>

      {!collapsed ? (
        <div className="question-dock-body">
          {!review ? (
            <>
              <div className="question-dock-question">{tr(language.t, question?.questionKey, question?.question ?? "")}</div>
              <div className="question-dock-hint">{multi ? language.t("question.multiHint") : language.t("question.singleHint")}</div>
              <div className="question-dock-options">
                {options.map((option, index) => {
                  const picked = answers[tab]?.includes(option.label) ?? false
                  return (
                    <button
                      key={option.label}
                      type="button"
                      className="question-dock-option"
                      data-slot="question-option"
                      data-picked={picked ? "true" : "false"}
                      disabled={sending}
                      onClick={() => selectOption(index)}
                    >
                      <span className="question-dock-option-marker" data-picked={picked ? "true" : "false"}>
                        {multi ? <Check size={10} weight="bold" /> : <span className="question-dock-option-dot" />}
                      </span>
                      <span className="question-dock-option-main">
                        <span className="question-dock-option-label">{tr(language.t, option.labelKey, option.label)}</span>
                        {option.description ? (
                          <span className="question-dock-option-desc">{tr(language.t, option.descriptionKey, option.description)}</span>
                        ) : null}
                      </span>
                    </button>
                  )
                })}
                {customEnabled ? (
                  <button
                    type="button"
                    className="question-dock-option"
                    data-slot="question-option"
                    data-custom="true"
                    data-picked={customPicked ? "true" : "false"}
                    disabled={sending}
                    onClick={() => selectOption(options.length)}
                  >
                    <span className="question-dock-option-marker" data-picked={customPicked ? "true" : "false"}>
                      {multi ? <Check size={10} weight="bold" /> : <span className="question-dock-option-dot" />}
                    </span>
                    <span className="question-dock-option-main">
                      <span className="question-dock-option-label">{language.t("question.custom")}</span>
                      {!editing ? <span className="question-dock-option-desc">{input || language.t("question.customPlaceholder")}</span> : null}
                    </span>
                  </button>
                ) : null}
                {editing ? (
                  <form className="question-dock-custom" onSubmit={handleCustomSubmit}>
                    <input
                      autoFocus
                      type="text"
                      value={input}
                      placeholder={language.t("question.customPlaceholder")}
                      disabled={sending}
                      onChange={(event) => {
                        const next = [...custom]
                        next[tab] = event.currentTarget.value
                        setCustom(next)
                      }}
                    />
                    <button type="submit" className="question-dock-custom-submit" disabled={sending || !input.trim()} aria-label={language.t("common.select")}>
                      <Check size={14} weight="bold" />
                    </button>
                    <button
                      type="button"
                      className="question-dock-custom-cancel"
                      disabled={sending}
                      onClick={() => setEditing(false)}
                      aria-label={language.t("common.cancel")}
                    >
                      <X size={14} weight="bold" />
                    </button>
                  </form>
                ) : null}
              </div>
            </>
          ) : (
            <div className="question-dock-review">
              <div className="question-dock-review-title">{language.t("question.review")}</div>
              {questions.map((item, index) => {
                const values = answers[index] ?? []
                return (
                  <div className="question-dock-review-row" key={item.question + index}>
                    <span className="question-dock-review-label">{tr(language.t, item.questionKey, item.question)}</span>
                    <span className="question-dock-review-value">
                      {values.length > 0 ? (
                        values.map((value) => {
                              const option = item.options?.find((entry) => entry.label === value)
                          return (
                            <span className="question-dock-review-choice" key={value}>
                              <span className="question-dock-review-choice-label">{tr(language.t, option?.labelKey, option?.label ?? value)}</span>
                              {option?.description ? (
                                <span className="question-dock-review-choice-desc">{tr(language.t, option.descriptionKey, option.description)}</span>
                              ) : null}
                            </span>
                          )
                        })
                      ) : (
                        <span className="question-dock-review-empty">{language.t("question.notAnswered")}</span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          <div className="question-dock-footer">
            <button type="button" className="question-dock-dismiss" onClick={reject} disabled={sending}>
              {language.t("common.cancel")}
            </button>
            <div className="question-dock-footer-actions">
              {editing ? (
                <button type="button" className="question-dock-back" onClick={clearCustomAnswer} disabled={sending}>
                  {language.t("question.clear")}
                </button>
              ) : null}
              {tab > 0 ? (
                <button type="button" className="question-dock-back" onClick={() => setTab((value) => value - 1)} disabled={sending}>
                  {review ? language.t("question.back") : language.t("question.previous")}
                </button>
              ) : null}
              {review ? (
                <button type="button" className="question-dock-submit" onClick={submit} disabled={sending}>
                  {language.t("question.submit")}
                </button>
              ) : (
                <button
                  type="button"
                  className="question-dock-next"
                  onClick={() => (single ? submit() : setTab((value) => value + 1))}
                  disabled={sending || (!single && (answers[tab]?.length ?? 0) === 0)}
                >
                  {single ? language.t("question.submit") : language.t("question.review")}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
