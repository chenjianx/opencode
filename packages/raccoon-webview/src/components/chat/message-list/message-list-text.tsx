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

export function AssistantText(props: { id: string; text: string; onOpenFile?: (filePath: string, line?: number, column?: number) => void }) {
  return (
    <div className="assistant-text-blocks">
      {splitThinkBlocks(props.text).map((block, index) => {
        if (block.type === "reasoning") {
          return (
            <details className="assistant-reasoning" key={`${props.id}-think-${index}`}>
              <summary>Thinking</summary>
              <MarkdownLite text={block.text} onOpenFile={props.onOpenFile} />
            </details>
          )
        }
        return <MarkdownLite key={`${props.id}-text-${index}`} text={block.text} onOpenFile={props.onOpenFile} />
      })}
    </div>
  )
}
