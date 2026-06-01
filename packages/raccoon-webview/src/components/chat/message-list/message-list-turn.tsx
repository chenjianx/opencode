import { useSession } from "../../../context/session"
import { AssistantText } from "./message-list-text"
import { turns, visibleParts } from "./message-list-model"
import { ToolPart } from "./message-list-tool"
import { UserMessage } from "./message-list-user"
import { QuestionDock } from "./question-dock"

export function MessageTurn(props: {
  turn: ReturnType<typeof turns>[number]
  session: ReturnType<typeof useSession>
  inlineQuestions: ReturnType<typeof useSession>["questions"]
}) {
  return (
    <article className="session-turn" key={props.turn.user?.id ?? props.turn.assistant[0]?.id}>
      {props.turn.user ? (
        <div className="turn-user">
          <div className="turn-role">You</div>
          <UserMessage
            message={props.turn.user}
            disabled={props.session.state.busy}
            onRevert={props.turn.assistant.length > 0 ? () => props.session.revertSession(props.turn.user!.id) : undefined}
          />
        </div>
      ) : null}
      {props.turn.assistant.map((message) => {
        const parts = visibleParts(message)
        return (
          <div className="turn-assistant" key={message.id}>
            <div className="turn-role">Raccoon</div>
            <div className="assistant-parts">
              {parts.length > 0 ? (
                <>
                  {parts.map((part) => {
                    if (part.type === "text") {
                      return <AssistantText key={part.id} id={part.id} text={part.text ?? ""} onOpenFile={props.session.openFile} />
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
                  {!(message.parts ?? []).some((part) => part.type === "text" && part.text?.trim()) && message.text.trim() ? (
                    <AssistantText id={message.id} text={message.text} onOpenFile={props.session.openFile} />
                  ) : null}
                </>
              ) : (
                <AssistantText id={message.id} text={message.text} onOpenFile={props.session.openFile} />
              )}
              {props.inlineQuestions
                .filter((request) => request.tool?.messageID === message.id)
                .map((request) => (
                  <QuestionDock key={request.id} request={request} />
                ))}
            </div>
          </div>
        )
      })}
    </article>
  )
}
