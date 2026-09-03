import { useState } from "react"
import { CheckIcon, CopyIcon } from "@phosphor-icons/react"
import { useLanguage } from "../../../context/language"
import { MarkdownLite } from "../../ui/markdown-lite"

function splitThinkBlocks(text: string) {
  const blocks: Array<{ type: "reasoning" | "text"; text: string }> = []
  const pattern = /<think>([\s\S]*?)<\/think>/gi
  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    if (match.index > last) {
      const before = text.slice(last, match.index)
      if (before.trim()) blocks.push({ type: "text", text: before })
    }
    const thinking = match[1]?.trim()
    if (thinking) blocks.push({ type: "reasoning", text: thinking })
    last = match.index + match[0].length
  }

  if (last < text.length) {
    const tail = text.slice(last)
    if (tail.trim()) blocks.push({ type: "text", text: tail })
  }

  return blocks.length > 0 ? blocks : [{ type: "text", text }]
}

export function assistantCopyText(text: string) {
  return splitThinkBlocks(text)
    .filter((block) => block.type === "text")
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n")
}

export function AssistantSummaryFooter(props: { text: string; meta: string; entering?: boolean }) {
  const language = useLanguage()
  const [copied, setCopied] = useState(false)
  const copyText = assistantCopyText(props.text)
  const copy = () => {
    if (!copyText || !navigator.clipboard?.writeText) return
    navigator.clipboard.writeText(copyText).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      },
      () => {},
    )
  }

  if (!copyText) return null

  return (
    <div className={`assistant-summary-actions${props.entering ? " is-entering" : ""}`}>
      {props.meta ? (
        <span className="assistant-summary-meta" title={props.meta}>
          {props.meta}
        </span>
      ) : null}
      <button
        type="button"
        className="assistant-summary-copy"
        onClick={() => void copy()}
        aria-label={copied ? language.t("assistant.copied") : language.t("assistant.copySummary")}
        title={copied ? language.t("assistant.copied") : language.t("assistant.copySummary")}
      >
        {copied ? <CheckIcon size={14} weight="bold" /> : <CopyIcon size={14} weight="bold" />}
      </button>
    </div>
  )
}

export function AssistantText(props: {
  id: string
  text: string
  streaming?: boolean
  onOpenFile?: (filePath: string, line?: number, column?: number) => void
}) {
  const blocks = splitThinkBlocks(props.text)

  return (
    <div className="assistant-message-row">
      <div className="assistant-text-blocks">
        {blocks.map((block, index) => {
          if (block.type === "reasoning") {
            return (
              <details className="assistant-reasoning" key={`${props.id}-think-${index}`}>
                <summary>Thinking</summary>
                <MarkdownLite text={block.text} streaming={props.streaming} onOpenFile={props.onOpenFile} />
              </details>
            )
          }
          return <MarkdownLite key={`${props.id}-text-${index}`} text={block.text} streaming={props.streaming} onOpenFile={props.onOpenFile} />
        })}
      </div>
    </div>
  )
}
