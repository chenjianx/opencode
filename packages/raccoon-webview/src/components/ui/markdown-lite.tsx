import { useDeferredValue, useEffect, useState } from "react"
import { CopyIcon, CheckIcon } from "@phosphor-icons/react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { bundledLanguages, codeToTokens, type BundledLanguage, type ThemedToken } from "shiki"
import { useLanguage } from "../../context/language"

const FILE_PATH_UNIX_RE =
  /^((?:\/|\.\.?\/)?(?:[a-zA-Z0-9_@-][a-zA-Z0-9_@./-]*\/)*[a-zA-Z0-9_@.-]+\.[a-zA-Z0-9]+)(?::(\d+)(?::(\d+))?|:(\d+)-\d+)?$/
const FILE_PATH_WIN_RE = /^((?:[a-zA-Z]:[/\\]|\\\\)(?:[^\\/]+[/\\])*[^\\/]+\.[a-zA-Z0-9]+)(?::(\d+)(?::(\d+))?|:(\d+)-\d+)?$/
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
const MAX_HIGHLIGHT_LENGTH = 50_000
const highlightCache = new Map<string, ThemedToken[][]>()

type FileReference = {
  filePath: string
  line?: number
  column?: number
}

export function parseFileReference(value: string): FileReference | undefined {
  const match = FILE_PATH_UNIX_RE.exec(value) ?? FILE_PATH_WIN_RE.exec(value)
  if (!match?.[1]) return
  return {
    filePath: match[1],
    line: match[2] ? Number.parseInt(match[2], 10) : match[4] ? Number.parseInt(match[4], 10) : undefined,
    column: match[3] ? Number.parseInt(match[3], 10) : undefined,
  }
}

type MarkdownNode = {
  type: string
  value?: string
  url?: string
  children?: MarkdownNode[]
}

type MarkdownRoot = MarkdownNode & { children: MarkdownNode[] }

function fileReferenceHref(reference: FileReference) {
  return `${reference.filePath}${reference.line ? `:${reference.line}` : ""}`
}

function splitBareFileReferences(node: MarkdownNode) {
  if (node.type === "link" || node.type === "linkReference") return
  if (!node.children) return

  node.children = node.children.flatMap((child) => {
    if (child.type !== "text" || !child.value) {
      splitBareFileReferences(child)
      return [child]
    }

    const children: MarkdownNode[] = []
    let last = 0
    for (const match of child.value.matchAll(/\S+/g)) {
      const token = match[0]
      const start = match.index ?? 0
      const leading = token.match(/^[([{<"'`]+/)?.[0] ?? ""
      const trailing = token.match(/[)\]}>，。！？；：,.'!?;:]+$/)?.[0] ?? ""
      const candidate = token.slice(leading.length, token.length - trailing.length || undefined)
      const reference = parseFileReference(candidate)
      if (!reference) continue

      const candidateStart = start + leading.length
      if (candidateStart > last) children.push({ type: "text", value: child.value.slice(last, candidateStart) })
      children.push({ type: "link", url: fileReferenceHref(reference), children: [{ type: "text", value: candidate }] })
      last = candidateStart + candidate.length
    }
    if (last === 0) return [child]
    if (last < child.value.length) children.push({ type: "text", value: child.value.slice(last) })
    return children
  })
}

function remarkBareFileReferences() {
  return (tree: MarkdownRoot) => splitBareFileReferences(tree)
}

function fileReferenceFromHref(href: string | undefined): FileReference | undefined {
  if (!href) return
  if (href.startsWith("file://")) {
    try {
      const decoded = decodeURIComponent(new URL(href).pathname)
      const c1 = decoded.charCodeAt(1)
      const filePath =
        decoded.length >= 4 &&
        decoded.charCodeAt(0) === 47 &&
        decoded.charCodeAt(2) === 58 &&
        ((c1 >= 65 && c1 <= 90) || (c1 >= 97 && c1 <= 122))
          ? decoded.slice(1)
          : decoded
      return filePath ? { filePath } : undefined
    } catch {
      return
    }
  }
  if (href.includes("://") || SCHEME_RE.test(href) || href.startsWith("#")) return
  return parseFileReference(href.replace(/[#?].*$/, ""))
}

function languageName(className: string | undefined) {
  return className?.split(" ").find((item) => item.startsWith("language-"))?.slice("language-".length)
}

function shikiLanguage(language: string | undefined) {
  const normalized = language?.toLowerCase()
  const aliases = {
    shell: "bash",
    sh: "bash",
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    md: "markdown",
  } as const
  const resolved = normalized && normalized in aliases ? aliases[normalized as keyof typeof aliases] : normalized
  return resolved && resolved in bundledLanguages ? (resolved as BundledLanguage) : "text"
}

function tokenClass(color: string | undefined) {
  const normalized = color?.toLowerCase()
  if (!normalized) return undefined
  const colors = {
    "#0000ff": "shiki-token-keyword",
    "#267f99": "shiki-token-type",
    "#001080": "shiki-token-variable",
    "#a31515": "shiki-token-string",
    "#098658": "shiki-token-number",
    "#795e26": "shiki-token-function",
    "#af00db": "shiki-token-control",
    "#008000": "shiki-token-comment",
  } as const
  return normalized in colors ? colors[normalized as keyof typeof colors] : undefined
}

function CodeBlock(props: { language?: string; code: string; streaming?: boolean }) {
  const { t } = useLanguage()
  const [tokens, setTokens] = useState<ThemedToken[][]>()
  const [copied, setCopied] = useState(false)
  const language = shikiLanguage(props.language)
  const deferredCode = useDeferredValue(props.code)

  useEffect(() => {
    let mounted = true
    if (props.streaming) {
      setTokens(undefined)
      return () => {
        mounted = false
      }
    }

    const code = deferredCode.replace(/\n$/, "")
    if (code.length > MAX_HIGHLIGHT_LENGTH) {
      setTokens(undefined)
      return () => {
        mounted = false
      }
    }

    const cacheKey = `${language}\u0000${code}`
    const cached = highlightCache.get(cacheKey)
    if (cached) {
      setTokens(cached)
      return () => {
        mounted = false
      }
    }

    setTokens(undefined)
    codeToTokens(code, {
      lang: language,
      theme: "light-plus",
    })
      .then((next) => {
        highlightCache.set(cacheKey, next.tokens)
        if (mounted) setTokens(next.tokens)
      })
      .catch((error) => {
        console.warn("Markdown code highlighting failed", language, error)
        if (mounted) setTokens(undefined)
      })
    return () => {
      mounted = false
    }
  }, [deferredCode, language, props.streaming])

  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(false), 1200)
    return () => clearTimeout(timeout)
  }, [copied])

  return (
    <div className="not-prose" data-component="markdown-code">
      <div data-slot="markdown-code-toolbar">
        {props.language ? <div data-slot="markdown-code-language">{props.language}</div> : null}
        <button
          type="button"
          data-slot="markdown-code-copy"
          aria-label={copied ? t("markdown.copied") : t("markdown.copy")}
          title={copied ? t("markdown.copied") : t("markdown.copy")}
          onClick={() => {
            void navigator.clipboard.writeText(props.code)
            setCopied(true)
          }}
        >
          {copied ? <CheckIcon weight="bold" /> : <CopyIcon weight="bold" />}
        </button>
      </div>
      <div data-slot="markdown-code-body">
        <pre>
          <code>
            {tokens
              ? tokens.map((line, lineIndex) => (
                  <span className="shiki-line" key={lineIndex}>
                    {line.map((token, tokenIndex) => (
                      <span className={tokenClass(token.color)} key={tokenIndex}>
                        {token.content}
                      </span>
                    ))}
                    {lineIndex < tokens.length - 1 ? "\n" : null}
                  </span>
                ))
              : props.code}
          </code>
        </pre>
      </div>
    </div>
  )
}

function components(onOpenFile?: (filePath: string, line?: number, column?: number) => void, streaming?: boolean): Components {
  return {
    a(props) {
      const fileReference = fileReferenceFromHref(typeof props.href === "string" ? props.href : undefined)
      return (
        <a
          {...props}
          data-file-link={fileReference ? "true" : undefined}
          rel="noopener noreferrer"
          target={fileReference ? undefined : "_blank"}
          onClick={(event) => {
            props.onClick?.(event)
            if (event.defaultPrevented || !fileReference || !onOpenFile) return
            event.preventDefault()
            onOpenFile(fileReference.filePath, fileReference.line, fileReference.column)
          }}
        />
      )
    },
    pre(props) {
      return <>{props.children}</>
    },
    code(props) {
      const language = languageName(props.className)
      const text = Array.isArray(props.children) ? props.children.join("") : `${props.children ?? ""}`
      // Treat as a block when it has a language, or when the content spans multiple lines
      // (fenced code without a language still ends with a newline). Inline code never
      // contains a newline. Without this, a language-less fenced block (e.g. an ASCII
      // directory tree) falls through to the inline branch and renders with no <pre>,
      // collapsing every line into one blob.
      const isBlock = language !== undefined || text.includes("\n")
      if (!isBlock) {
        const fileReference = parseFileReference(text.trim())
        return (
          <code
            {...props}
            data-file-link={fileReference && onOpenFile ? "true" : undefined}
            className={[props.className, fileReference && onOpenFile ? "file-link" : undefined].filter(Boolean).join(" ") || undefined}
            onClick={(event) => {
              props.onClick?.(event)
              if (event.defaultPrevented || !fileReference || !onOpenFile) return
              event.preventDefault()
              onOpenFile(fileReference.filePath, fileReference.line, fileReference.column)
            }}
          />
        )
      }
      return <CodeBlock code={text} language={language} streaming={streaming} />
    },
    table(props) {
      return (
        <div data-component="markdown-table">
          <table {...props} />
        </div>
      )
    },
  }
}

export function MarkdownLite(props: {
  text: string
  streaming?: boolean
  onOpenFile?: (filePath: string, line?: number, column?: number) => void
}) {
  return (
    <div className="prose max-w-none text-[12px] leading-[17px] text-[var(--color-foreground)]" data-component="markdown-lite">
      <ReactMarkdown components={components(props.onOpenFile, props.streaming)} remarkPlugins={[remarkGfm, remarkBareFileReferences]} skipHtml>
        {props.text}
      </ReactMarkdown>
    </div>
  )
}
