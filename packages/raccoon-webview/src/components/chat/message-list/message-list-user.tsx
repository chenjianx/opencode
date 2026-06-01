import { useState } from "react"
import { ArrowClockwiseIcon, ArrowUUpLeftIcon, CheckIcon, CopyIcon, ImageIcon, PaperclipIcon } from "@phosphor-icons/react"
import { useLanguage } from "../../../context/language"
import { useSession } from "../../../context/session"
import type { RaccoonMessage } from "../../../protocol"

export function UserMessage(props: { message: RaccoonMessage; disabled?: boolean; onRevert?: () => void }) {
  const text = props.message.parts.filter((part) => part.type === "text" && !part.synthetic).map((part) => part.text ?? "").join("\n\n").trim()
  const attachments = props.message.parts.filter((part) => part.type === "file")
  const [copied, setCopied] = useState(false)
  const session = useSession()

  const copy = () => {
    if (!navigator.clipboard?.writeText) return
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      },
      () => {},
    )
  }

  if (!text && attachments.length === 0) return null

  return (
    <div className="user-message-row">
      <div className="user-message-content">
        {attachments.length > 0 ? (
          <div className="user-message-attachments">
            {attachments.map((attachment) => (
              <div className="user-message-attachment" key={`${attachment.id}-${attachment.url}`}>
                {attachment.mime?.startsWith("image/") ? (
                  <button
                    type="button"
                    className="user-message-attachment-image-button"
                    onClick={() => {
                      if (!attachment.url) return
                      session.openImage({ url: attachment.url, filename: attachment.filename, mime: attachment.mime })
                    }}
                  >
                    <img className="user-message-attachment-image" src={attachment.url} alt={attachment.filename ?? "attachment"} />
                  </button>
                ) : (
                  <div className="user-message-attachment-fallback">
                    <PaperclipIcon size={16} weight="bold" />
                    <span>{attachment.filename ?? "attachment"}</span>
                  </div>
                )}
                <span className="user-message-attachment-label">
                  {attachment.mime?.startsWith("image/") ? <ImageIcon size={12} weight="bold" /> : <PaperclipIcon size={12} weight="bold" />}
                  <span>{attachment.filename ?? "attachment"}</span>
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {text ? (
          <p>
            {text.split(/(@\S+)/g).map((part, index) =>
              part.startsWith("@") ? (
                <span className="user-mention" key={index}>
                  {part}
                </span>
              ) : (
                part
              ),
            )}
          </p>
        ) : null}
      </div>
      <div className="user-message-actions">
        {props.onRevert ? (
          <button type="button" className="user-message-icon-button" onClick={props.onRevert} disabled={props.disabled} aria-label="Revert message">
            <ArrowUUpLeftIcon size={14} />
          </button>
        ) : null}
        {text ? (
          <button type="button" className="user-message-icon-button" onClick={() => void copy()} aria-label={copied ? "Copied" : "Copy message"}>
            {copied ? <CheckIcon size={14} weight="bold" /> : <CopyIcon size={14} weight="bold" />}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function RevertBar(props: { items: RaccoonMessage[] }) {
  const session = useSession()
  const language = useLanguage()
  const [first] = props.items
  if (!first) return null

  return (
    <div className="revert-bar">
      <div className="revert-bar-head">
        <span>{language.t("revert.title", { count: props.items.length })}</span>
        <button
          type="button"
          className="revert-bar-action"
          onClick={() => session.restoreRevertedMessage(first.id)}
          disabled={session.state.busy}
          aria-label={language.t("revert.restore")}
        >
          <ArrowClockwiseIcon size={14} />
          <span>{language.t("revert.restore")}</span>
        </button>
      </div>
      <div className="revert-bar-list">
        {props.items.map((item) => (
          <div className="revert-bar-row" key={item.id}>
            <span className="revert-bar-text">{item.text || item.id}</span>
            <button
              type="button"
              className="revert-bar-mini"
              onClick={() => session.restoreRevertedMessage(item.id)}
              disabled={session.state.busy}
              aria-label={language.t("revert.restore")}
            >
              <ArrowUUpLeftIcon size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
