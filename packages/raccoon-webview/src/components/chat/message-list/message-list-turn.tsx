import { useSession } from "../../../context/session"
import { AssistantCopyButton, AssistantText } from "./message-list-text"
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
        return { id: part.id, text: part.text ?? "" }
      }
    }
    if (message.text?.trim()) {
      return { id: message.id, text: message.text }
    }
  }
  return undefined
}

export function MessageTurn(props: {
  turn: ReturnType<typeof turns>[number]
  session: ReturnType<typeof useSession>
  inlineQuestions: ReturnType<typeof useSession>["questions"]
  readonly?: boolean
}) {
  const target = copyTarget(props.turn)
  const groups = turnPartGroups(
    props.turn.assistant,
    new Set(props.inlineQuestions.flatMap((request) => (request.tool?.messageID ? [request.tool.messageID] : []))),
  )
  const lastAssistantID = props.turn.assistant.at(-1)?.id

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
                const streaming = props.session.state.busy && group.entry.messageID === lastAssistantID
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
        </div>
      ) : null}
      {target ? <AssistantCopyButton text={target.text} /> : null}
    </article>
  )
}
