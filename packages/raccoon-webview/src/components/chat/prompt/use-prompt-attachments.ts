import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react"
import type { RaccoonFileAttachment } from "../../../protocol"
import { buildImageAttachments } from "./prompt-input-utils"

export function usePromptAttachments(onOpenImage: (attachment: RaccoonFileAttachment) => void) {
  const [attachments, setAttachments] = useState<RaccoonFileAttachment[]>([])
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  useEffect(() => {
    const onWindowDragEnd = () => {
      dragDepth.current = 0
      setDragging(false)
    }
    window.addEventListener("dragend", onWindowDragEnd)
    window.addEventListener("drop", onWindowDragEnd)
    return () => {
      window.removeEventListener("dragend", onWindowDragEnd)
      window.removeEventListener("drop", onWindowDragEnd)
    }
  }, [])

  const addAttachments = async (files: File[]) => {
    const built = await buildImageAttachments(files)
    if (built.length === 0) return
    setAttachments((current) => [...current, ...built])
  }

  const handlePaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file && file.type.startsWith("image/"))
    if (files.length === 0) return
    event.preventDefault()
    await addAttachments(files)
  }

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"))
    if (files.length === 0) return
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    await addAttachments(files)
  }

  const removeAttachment = (path: string) => {
    setAttachments((current) => current.filter((item) => item.path !== path))
  }

  return {
    attachments,
    dragging,
    handlePaste,
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
    removeAttachment,
    openAttachment: onOpenImage,
    clear: () => setAttachments([]),
  }
}
