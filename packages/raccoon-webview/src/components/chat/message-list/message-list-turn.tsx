import { useSession } from "../../../context/session"
import { AssistantCopyButton, AssistantText } from "./message-list-text"
import { turns, visibleParts } from "./message-list-model"
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

  return (
    <article className="session-turn" key={props.turn.user?.id ?? props.turn.assistant[0]?.id}>
      {props.turn.user ? (
        <div className="turn-user">
          <div className="turn-role">You</div>
          <UserMessage
            message={props.turn.user}
            disabled={props.readonly || props.session.state.busy}
            onRevert={!props.readonly && props.turn.assistant.length > 0 ? () => props.session.revertSession(props.turn.user!.id) : undefined}
          />
        </div>
      ) : null}
      {props.turn.assistant.map((message) => {
        const parts = visibleParts(message)
        const hasTextPart = (message.parts ?? []).some((part) => part.type === "text" && part.text?.trim())
        const streaming = props.session.state.busy && message.id === props.turn.assistant.at(-1)?.id
        return (
          <div className="turn-assistant-group" key={message.id}>
            <div className="turn-assistant">
              <div className="turn-role">Raccoon</div>
              <div className="assistant-parts">
                {parts.length > 0 ? (
                  <>
                    {parts.map((part) => {
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
                      if (part.type === "tool") {
                        return <ToolPart part={part} key={part.id} />
                      }
                      return (
                        <div className="tool-part muted" key={part.id}>
                          <span className="tool-dot" />
                          <span className="tool-name">{part.title ?? part.type}</span>
                        </div>
                      )
                    })}
                    {!hasTextPart && message.text.trim() ? (
                      <AssistantText
                        id={message.id}
                        text={message.text}
                        streaming={streaming}
                        onOpenFile={props.session.openFile}
                      />
                    ) : null}
                  </>
                ) : (
                  <AssistantText
                    id={message.id}
                    text={message.text}
                    streaming={streaming}
                    onOpenFile={props.session.openFile}
                  />
                )}
                {props.inlineQuestions
                  .filter((request) => request.tool?.messageID === message.id)
                  .map((request) => (
                    <QuestionDock key={request.id} request={request} />
                  ))}
              </div>
            </div>
          </div>
        )
      })}
      {target ? <AssistantCopyButton text={target.text} /> : null}
    </article>
  )
}
