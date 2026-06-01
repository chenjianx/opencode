import { ImageIcon } from "@phosphor-icons/react"

export function PromptDragOverlay(props: { active: boolean }) {
  if (!props.active) return null

  return (
    <div className="prompt-drag-overlay" aria-hidden="true">
      <div className="prompt-drag-overlay-content">
        <ImageIcon size={28} weight="bold" />
        <span>Drop images to attach</span>
      </div>
    </div>
  )
}
