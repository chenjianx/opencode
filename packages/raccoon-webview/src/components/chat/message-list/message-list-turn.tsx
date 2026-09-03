import { useEffect, useRef } from "react"
import { useSession } from "../../../context/session"
import { useLanguage } from "../../../context/language"
import type { RaccoonMessage, RaccoonModel } from "../../../protocol"
import { AssistantSummaryFooter, AssistantText } from "./message-list-text"
import { turnPartGroups, turns, visibleParts } from "./message-list-model"
import { ToolPart } from "./message-list-tool"
import { UserMessage } from "./message-list-user"
import { QuestionDock } from "./question-dock"

function copyTarget(turn: ReturnType<typeof turns>[number]) {
  for (let i = turn.assistant.length - 1; i >= 0; i--) {
    const message = turn.assistant[i]
    if (!message) continue
    const parts = visibleParts(message)
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j]
      if (part && part.type === "text" && part.text?.trim()) {
        return { id: part.id, text: part.text ?? "", message }
      }
    }
    if (message.text?.trim()) {
      return { id: message.id, text: message.text, message }
    }
  }
  return undefined
}

function turnDuration(turn: ReturnType<typeof turns>[number]) {
  const startedAt = turn.user?.createdAt ?? turn.assistant[0]?.createdAt
  const completedAt = turn.assistant.reduce<number | undefined>((latest, message) => {
    if (message.completedAt === undefined) return latest
    return latest === undefined ? message.completedAt : Math.max(latest, message.completedAt)
  }, undefined)
  if (startedAt === undefined || completedAt === undefined || completedAt < startedAt) return
  return completedAt - startedAt
}

function formatDuration(duration: number | undefined, t: ReturnType<typeof useLanguage>["t"]) {
  if (duration === undefined) return ""
  const seconds = Math.max(1, Math.round(duration / 1_000))
  if (seconds < 60) return t("assistant.duration.seconds", { count: seconds })
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return t("assistant.duration.minutesSeconds", { minutes, seconds: remainingSeconds })
  return t("assistant.duration.hoursMinutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
}

function assistantMeta(
  turn: ReturnType<typeof turns>[number],
  message: RaccoonMessage,
  models: RaccoonModel[],
  t: ReturnType<typeof useLanguage>["t"],
) {
  const agent = message.agent ? `${message.agent[0]?.toUpperCase()}${message.agent.slice(1)}` : ""
  const model = models.find(
    (item) => item.providerID === message.providerID && item.modelID === message.modelID,
  )?.modelName
  return [agent, model ?? message.modelID ?? "", formatDuration(turnDuration(turn), t)].filter(Boolean).join(" · ")
}

export function MessageTurn(props: {
  turn: ReturnType<typeof turns>[number]
  session: ReturnType<typeof useSession>
  inlineQuestions: ReturnType<typeof useSession>["questions"]
  readonly?: boolean
  busy?: boolean
}) {
  const language = useLanguage()
  const target = copyTarget(props.turn)
  const groups = turnPartGroups(
    props.turn.assistant,
    new Set(props.inlineQuestions.flatMap((request) => (request.tool?.messageID ? [request.tool.messageID] : []))),
  )
  const lastAssistantID = props.turn.assistant.at(-1)?.id
  const busyRef = useRef(!!props.busy)
  const footerEntering = busyRef.current && !props.busy

  useEffect(() => {
    busyRef.current = !!props.busy
  }, [props.busy])

  return (
    <article className="session-turn" key={props.turn.user?.id ?? props.turn.assistant[0]?.id}>
      {props.turn.user ? (
        <div className="turn-user">
          <UserMessage
            message={props.turn.user}
            disabled={props.readonly || props.session.state.busy}
            onRevert={!props.readonly && props.turn.assistant.length > 0 ? () => props.session.revertSession(props.turn.user!.id) : undefined}
          />
        </div>
      ) : null}
      {props.turn.assistant.length > 0 ? (
        <div className="turn-assistant-group">
          <div className="turn-assistant">
            <div className="turn-role">Raccoon</div>
            <div className="assistant-parts">
              {groups.map((group) => {
                if (group.type === "boundary") {
                  return (
                    <div className="assistant-inline-questions" key={`questions-${group.messageID}`}>
                      {props.inlineQuestions
                        .filter((request) => request.tool?.messageID === group.messageID)
                        .map((request) => (
                          <QuestionDock key={request.id} request={request} />
                        ))}
                    </div>
                  )
                }
                if (group.type === "tools") {
                  return (
                    <div className="tool-activity" key={`tools-${group.entries[0]?.part.id}`}>
                      {group.entries.map((entry) => (
                        <ToolPart part={entry.part} key={entry.part.id} />
                      ))}
                    </div>
                  )
                }
                const part = group.entry.part
                const streaming = !!props.busy && group.entry.messageID === lastAssistantID
                if (part.type === "text") {
                  return (
                    <AssistantText
                      key={part.id}
                      id={part.id}
                      text={part.text ?? ""}
                      streaming={streaming}
                      onOpenFile={props.session.openFile}
                    />
                  )
                }
                if (part.type === "reasoning") {
                  return (
                    <details className="assistant-reasoning" key={part.id}>
                      <summary>Thinking</summary>
                      <p>{part.text}</p>
                    </details>
                  )
                }
                return (
                  <div className="tool-part muted" key={part.id}>
                    <span className="tool-dot" />
                    <span className="tool-name">{part.title ?? part.type}</span>
                  </div>
                )
              })}
            </div>
          </div>
          {!props.busy && target ? (
            <AssistantSummaryFooter
              text={target.text}
              meta={assistantMeta(props.turn, target.message, props.session.models, language.t)}
              entering={footerEntering}
            />
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
