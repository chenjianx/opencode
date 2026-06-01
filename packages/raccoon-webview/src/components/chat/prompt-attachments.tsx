import { ImageIcon, PaperclipIcon, XIcon } from "@phosphor-icons/react"
import type { RaccoonFileAttachment } from "../../protocol"

export function PromptAttachments(props: {
  attachments: RaccoonFileAttachment[]
  onOpen: (attachment: RaccoonFileAttachment) => void
  onRemove: (path: string) => void
}) {
  if (props.attachments.length === 0) return null

  return (
    <div className="prompt-attachments">
      {props.attachments.map((attachment) => (
        <div className="prompt-attachment" key={`${attachment.path}-${attachment.url}`} title={attachment.filename ?? attachment.path}>
          {attachment.mime?.startsWith("image/") ? (
            <button type="button" className="prompt-attachment-image-button" onClick={() => props.onOpen(attachment)}>
              <img className="prompt-attachment-image" src={attachment.url} alt={attachment.filename ?? attachment.path} />
            </button>
          ) : (
            <div className="prompt-attachment-fallback">
              <PaperclipIcon size={18} weight="bold" />
              <span>{attachment.filename ?? attachment.path}</span>
            </div>
          )}
          <button type="button" className="prompt-attachment-remove" onClick={() => props.onRemove(attachment.path)} aria-label="Remove attachment">
            <XIcon size={12} weight="bold" />
          </button>
        </div>
      ))}
    </div>
  )
}
