import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArrowClockwiseIcon, PaperPlaneRightIcon } from "@phosphor-icons/react"
import { useSession } from "../../context/session"
import type { RaccoonFileAttachment } from "../../protocol"
import type { ExtensionToWebview, RaccoonSlashCommand } from "../../protocol"
import { useVSCode } from "../../context/vscode"
import { ModelPicker } from "../ui/model-picker"
import { PromptAttachments } from "./prompt-attachments"
import { PromptDragOverlay } from "./prompt-drag-overlay"
import {
  dirName,
  fileName,
  hasGitChangesMention,
  hasTerminalMention,
  mentionGroupText,
  mentionQuery,
  mentionText,
  textAttachment,
  useFileMention,
} from "./file-mention"

function slashQuery(value: string, selectionStart: number | null) {
  const cursor = selectionStart ?? value.length
  if (!value.startsWith("/") || cursor === 0) return
  const beforeCursor = value.slice(0, cursor)
  if (beforeCursor.match(/\s/)) return
  if (value.match(/^\S+\s+\S+\s*$/)) return
  return beforeCursor.slice(1).toLowerCase()
}

function commandGroupLabel(source: RaccoonSlashCommand["source"]) {
  if (source === "ui") return "App"
  if (source === "command") return "Commands"
  if (source === "mcp") return "MCP"
  return "Skills"
}

function modeLabel(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

type ModelSelection = { providerID: string; modelID: string }

export function PromptInput() {
  const session = useSession()
  const vscode = useVSCode()
  const modeRef = useRef<HTMLDivElement>(null)
  const commandRef = useRef<HTMLDivElement>(null)
  const mentionRef = useRef<HTMLDivElement>(null)
  const commandItemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const mentionItemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dragDepth = useRef(0)
  const [draft, setDraft] = useState("")
  const [attachments, setAttachments] = useState<RaccoonFileAttachment[]>([])
  const [dragging, setDragging] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandSelected, setCommandSelected] = useState(0)
  const [sessionModels, setSessionModels] = useState<Record<string, ModelSelection>>({})
  const minTextareaHeight = 76
  const maxTextareaHeight = 220
  const modeOptions = session.state.agents
    .filter((agent) => agent.mode !== "subagent" && !agent.hidden)
    .map((agent) => ({
      value: agent.name,
      label: modeLabel(agent.name),
      description: agent.description,
    }))
  const currentMode = modeOptions.find((mode) => mode.value === session.state.mode) ?? {
    value: session.state.mode,
    label: modeLabel(session.state.mode),
  }
  const activeSessionID = session.state.activeSessionID
  const conversationModel = activeSessionID ? sessionModels[activeSessionID] : undefined
  const selectedModel = conversationModel ?? session.selectedModel
  const canSend = session.canSend(draft, attachments)
  const busy = session.state.busy ?? false
  const commandQuery = slashQuery(draft, textareaRef.current?.selectionStart ?? draft.length)
  const atQuery = mentionQuery(draft, textareaRef.current?.selectionStart ?? draft.length)
  const mention = useFileMention(commandQuery === undefined ? atQuery : undefined)
  const commandOptions = useMemo(
    () =>
      session.slashCommands
        .filter((command) =>
          `${command.name} ${command.aliases?.join(" ") ?? ""} ${command.description ?? ""} ${command.source}`.toLowerCase().includes(commandQuery ?? ""),
        ),
    [commandQuery, session.slashCommands],
  )
  const commandGroups = useMemo(() => {
    const order: RaccoonSlashCommand["source"][] = ["ui", "command", "mcp", "skill"]
    return order
      .map((source) => ({
        source,
        items: commandOptions
          .map((command, index) => ({ command, index }))
          .filter((item) => item.command.source === source),
      }))
      .filter((group) => group.items.length > 0)
  }, [commandOptions])
  const commandVisible = commandOpen && commandQuery !== undefined && commandOptions.length > 0
  const mentionVisible = mention.visible

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (modeOpen && !modeRef.current?.contains(event.target as Node)) setModeOpen(false)
      if (commandOpen && !commandRef.current?.contains(event.target as Node) && event.target !== textareaRef.current) setCommandOpen(false)
      if (mention.open && !mentionRef.current?.contains(event.target as Node) && event.target !== textareaRef.current) mention.close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setModeOpen(false)
      setCommandOpen(false)
      mention.close()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [commandOpen, mention, modeOpen])

  useEffect(() => {
    if (commandQuery === undefined) {
      setCommandOpen(false)
      setCommandSelected(0)
      return
    }
    setCommandOpen(true)
    setCommandSelected(0)
  }, [commandQuery])

  useEffect(() => {
    if (!commandVisible) return
    commandItemRefs.current[commandSelected]?.scrollIntoView({ block: "nearest" })
  }, [commandSelected, commandVisible])

  useEffect(() => {
    if (!mentionVisible) return
    mentionItemRefs.current[mention.selected]?.scrollIntoView({ block: "nearest" })
  }, [mention.selected, mentionVisible])

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

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = "0px"
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minTextareaHeight), maxTextareaHeight)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > maxTextareaHeight ? "auto" : "hidden"
  }, [draft])

  useEffect(() => {
    const unsubscribe = vscode.onMessage((message) => {
      if (message.type !== "appendPrompt") return
      setDraft((current) => (message.replace || current.trim().length === 0 ? message.text : `${current.trimEnd()}\n\n${message.text}`))
      setCommandOpen(false)
      mention.close()
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
        const position = textareaRef.current?.value.length ?? 0
        textareaRef.current?.setSelectionRange(position, position)
      })
    })
    return unsubscribe
  }, [mention, vscode])

  const requestContext = (kind: "terminal" | "git-changes", sessionID?: string) =>
    new Promise<string>((resolve, reject) => {
      const requestID = `${kind}-context-${Date.now()}-${Math.random().toString(36).slice(2)}`
      let unsubscribe = () => {}
      const timeout = setTimeout(() => {
        unsubscribe()
        reject(new Error(`Timed out while reading ${kind === "terminal" ? "terminal output" : "git changes"}`))
      }, kind === "terminal" ? 10_000 : 15_000)
      const done = (run: () => void) => {
        clearTimeout(timeout)
        unsubscribe()
        run()
      }
      unsubscribe = vscode.onMessage((message: ExtensionToWebview) => {
        if (kind === "terminal" && message.type === "terminalContextResult" && message.requestID === requestID) {
          done(() => resolve(message.content))
          return
        }
        if (kind === "terminal" && message.type === "terminalContextError" && message.requestID === requestID) {
          done(() => reject(new Error(message.error)))
          return
        }
        if (kind === "git-changes" && message.type === "gitChangesContextResult" && message.requestID === requestID) {
          done(() => resolve(message.content))
          return
        }
        if (kind === "git-changes" && message.type === "gitChangesContextError" && message.requestID === requestID) {
          done(() => reject(new Error(message.error)))
        }
      })
      vscode.postMessage({
        type: kind === "terminal" ? "requestTerminalContext" : "requestGitChangesContext",
        requestID,
        sessionID,
      })
    })

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.addEventListener("error", () => resolve(""))
      reader.addEventListener("load", () => {
        const value = typeof reader.result === "string" ? reader.result : ""
        const index = value.indexOf(",")
        resolve(index === -1 ? value : value.slice(index + 1))
      })
      reader.readAsDataURL(file)
    })

  const addAttachments = async (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith("image/"))
    if (images.length === 0) return

    const next = await Promise.all<RaccoonFileAttachment | null>(
      images.map(async (file, index) => {
        const data = await fileToDataUrl(file)
        if (!data) return null
        return {
          path: file.name || `image-${Date.now()}-${index}.png`,
          filename: file.name || `image-${Date.now()}-${index}.png`,
          mime: file.type || "image/png",
          url: data.startsWith("data:") ? data : `data:${file.type || "image/png"};base64,${data}`,
        } satisfies RaccoonFileAttachment
      }),
    )

    setAttachments((current) => [...current, ...next.filter((item): item is RaccoonFileAttachment => !!item)])
  }

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file && file.type.startsWith("image/"))

    if (files.length === 0) return

    event.preventDefault()
    await addAttachments(files)
  }

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
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

  const openAttachment = (attachment: RaccoonFileAttachment) => {
    session.openImage({ url: attachment.url, filename: attachment.filename, mime: attachment.mime })
  }

  const send = async () => {
    if (busy) {
      session.stopSession()
      return
    }
    if (!canSend) return
    const slashName = draft.startsWith("/") ? draft.split(/\s+/)[0]?.slice(1) : undefined
    const slashCommand = slashName ? session.slashCommands.find((command) => command.name === slashName || command.aliases?.includes(slashName)) : undefined
    if (slashCommand?.mode === "action") {
      session.runSlashCommand(slashCommand.name)
      setDraft("")
      setCommandOpen(false)
      return
    }
    const sessionID = session.state.activeSessionID
    let terminalFile
    let gitFile
    try {
      terminalFile = hasTerminalMention(draft)
        ? textAttachment(draft, "terminal", "terminal-output.txt", await requestContext("terminal", sessionID))
        : undefined
      gitFile = hasGitChangesMention(draft)
        ? textAttachment(draft, "git-changes", "git-changes.txt", await requestContext("git-changes", sessionID))
        : undefined
    } catch (error) {
      console.error(error)
      return
    }
    session.sendMessage(
      draft,
      [...attachments, ...mention.parseFileAttachments(draft, session.state.directory ?? ""), ...(terminalFile ? [terminalFile] : []), ...(gitFile ? [gitFile] : [])],
      selectedModel,
    )
    setDraft("")
    setAttachments([])
    setCommandOpen(false)
    mention.close()
    mention.clearMentionedPaths()
  }

  const selectCommand = (command: RaccoonSlashCommand) => {
    if (command.mode === "action") {
      setDraft("")
      setCommandOpen(false)
      session.runSlashCommand(command.name)
      return
    }
    setDraft(`/${command.name} `)
    setCommandOpen(false)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const selectMention = (item = mention.items[mention.selected] ?? mention.items[0]) => {
    const textarea = textareaRef.current
    if (!textarea || !item) return
    const cursor = textarea.selectionStart ?? draft.length
    const before = draft.slice(0, cursor)
    const after = draft.slice(cursor)
    if (item.type === "file-group" || item.type === "folder-group") {
      const next = mentionGroupText(before, item) + after
      const position = next.length - after.length
      setDraft(next)
      mention.showKind(item.type === "file-group" ? "file" : "folder")
      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(position, position)
      })
      return
    }
    const next = mentionText(before, after, item)
    const position = next.length - after.length
    setDraft(next)
    mention.addMentionedPath(item.path)
    mention.close()
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(position, position)
    })
  }

  return (
    <div className="mt-2.5 mb-2 flex w-full flex-col border-t border-[var(--color-border)] px-0 pt-2">
      <div
        className="relative flex flex-col gap-1.5 rounded-[6px] border border-[color-mix(in_srgb,var(--color-border)_82%,var(--color-foreground))] bg-[var(--color-background)] p-0"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <PromptDragOverlay active={dragging} />
        {commandVisible ? (
          <div
            className="absolute bottom-[calc(100%+6px)] left-0 z-30 max-h-[220px] w-full overflow-y-auto rounded-[6px] border border-[var(--color-border)] bg-[var(--color-background)] py-1 shadow-[var(--shadow-md)]"
            ref={commandRef}
            role="listbox"
            aria-label="Commands"
          >
            {commandGroups.map((group, groupIndex) => (
              <div className={groupIndex === 0 ? "" : "mt-1 border-t border-[var(--color-border)] pt-1"} key={group.source}>
                <div className="px-3 py-1 text-[11px] font-medium leading-4 text-[var(--color-muted)]">
                  {commandGroupLabel(group.source)}
                </div>
                {group.items.map((item) => (
                  <button
                    ref={(element) => {
                      commandItemRefs.current[item.index] = element
                    }}
                    type="button"
                    className={`flex w-full items-center gap-2 border-0 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--color-hover)] ${
                      item.index === commandSelected ? "bg-[var(--vscode-list-activeSelectionBackground,var(--color-hover))] text-[var(--vscode-list-activeSelectionForeground,var(--color-foreground))]" : "bg-transparent text-[var(--color-foreground)]"
                    }`}
                    key={item.command.name}
                    role="option"
                    aria-selected={item.index === commandSelected}
                    onMouseEnter={() => setCommandSelected(item.index)}
                    onClick={() => selectCommand(item.command)}
                  >
                    <span className="shrink-0 font-semibold">/{item.command.name}</span>
                    {item.command.description ? <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--color-muted)]">{item.command.description}</span> : null}
                    {item.command.aliases?.length ? <span className="ml-auto shrink-0 text-[10px] text-[var(--color-muted)]">{item.command.aliases.map((alias) => `/${alias}`).join(" ")}</span> : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : null}
        {mentionVisible ? (
          <div
            className="absolute bottom-[calc(100%+6px)] left-0 z-30 max-h-[220px] w-full overflow-y-auto rounded-[6px] border border-[var(--color-border)] bg-[var(--color-background)] py-1 shadow-[var(--shadow-md)]"
            ref={mentionRef}
            role="listbox"
            aria-label="File mentions"
          >
            {mention.items.map((item, index) => {
              const directory = item.type === "file" || item.type === "folder" || item.type === "opened-file" ? dirName(item.path) : ""
              return (
                <button
                  ref={(element) => {
                    mentionItemRefs.current[index] = element
                  }}
                  type="button"
                  className={`flex w-full items-center gap-2 border-0 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--color-hover)] ${
                    index === mention.selected ? "bg-[var(--vscode-list-activeSelectionBackground,var(--color-hover))] text-[var(--vscode-list-activeSelectionForeground,var(--color-foreground))]" : "bg-transparent text-[var(--color-foreground)]"
                  }`}
                  key={`${item.type}:${item.path}`}
                  role="option"
                  aria-selected={index === mention.selected}
                  onMouseEnter={() => mention.setSelected(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectMention(item)}
                >
                  {item.type === "terminal" || item.type === "git-changes" || item.type === "file-group" || item.type === "folder-group" ? (
                    <>
                      <span className="min-w-0 shrink overflow-hidden text-ellipsis whitespace-nowrap font-semibold">
                        @{item.path}
                      </span>
                      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--color-muted)]">
                        {item.description}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 shrink overflow-hidden text-ellipsis whitespace-nowrap font-semibold">
                        {item.type === "folder" ? `${fileName(item.path)}/` : fileName(item.path)}
                      </span>
                      {directory ? (
                        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--color-muted)]">
                          {directory}
                        </span>
                      ) : null}
                    </>
                  )}
                </button>
              )
            })}
          </div>
        ) : null}
        <PromptAttachments attachments={attachments} onOpen={openAttachment} onRemove={removeAttachment} />
        <textarea
          ref={textareaRef}
          className="min-h-[76px] w-full resize-none rounded-[4px] border border-transparent bg-transparent px-[7px] py-1.5 text-[13px] leading-[19px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted)]"
          style={{ height: `${minTextareaHeight}px` }}
          value={draft}
          placeholder={'输入问题，键入 "/" 执行命令，键入 "@" 添加上下文'}
          onPaste={handlePaste}
          onChange={(event) => {
            setDraft(event.currentTarget.value)
            setCommandOpen(slashQuery(event.currentTarget.value, event.currentTarget.selectionStart) !== undefined)
          }}
          onClick={(event) => setCommandOpen(slashQuery(draft, event.currentTarget.selectionStart) !== undefined)}
          onKeyUp={(event) => setCommandOpen(slashQuery(draft, event.currentTarget.selectionStart) !== undefined)}
          onKeyDown={(event) => {
            if (mentionVisible) {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                mention.next()
                return
              }
              if (event.key === "ArrowUp") {
                event.preventDefault()
                mention.previous()
                return
              }
              if (event.key === "Escape") {
                event.preventDefault()
                mention.close()
                return
              }
              if (event.key === "Tab") {
                event.preventDefault()
                selectMention()
                return
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                selectMention()
                return
              }
            }
            if (commandVisible) {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setCommandSelected((index) => (index + 1) % commandOptions.length)
                return
              }
              if (event.key === "ArrowUp") {
                event.preventDefault()
                setCommandSelected((index) => (index - 1 + commandOptions.length) % commandOptions.length)
                return
              }
              if (event.key === "Escape") {
                event.preventDefault()
                setCommandOpen(false)
                return
              }
              if (event.key === "Tab") {
                event.preventDefault()
                selectCommand(commandOptions[commandSelected] ?? commandOptions[0]!)
                return
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                selectCommand(commandOptions[commandSelected] ?? commandOptions[0]!)
                return
              }
            }
            if (event.key !== "Enter" || event.shiftKey) return
            event.preventDefault()
            send()
          }}
        />
        <div className="relative px-1.5 pb-1.5 pr-[40px]">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <div className="relative inline-flex w-max flex-none" ref={modeRef}>
              <button
                type="button"
                className="flex h-[26px] w-max items-center justify-between gap-1.5 rounded-[4px] border border-[var(--color-border)] bg-transparent px-2 text-left text-[12px] leading-none text-[var(--color-foreground)] hover:bg-[var(--color-hover)] focus:outline focus:outline-1 focus:outline-offset-[-1px] focus:outline-[var(--color-focus)]"
                aria-label="Mode"
                aria-haspopup="listbox"
                aria-expanded={modeOpen}
                onClick={() => setModeOpen((open) => !open)}
              >
                <span className="whitespace-nowrap font-medium">{currentMode?.label ?? "Mode"}</span>
                <span className="shrink-0 text-[11px] text-[var(--color-muted)]">▾</span>
              </button>
              {modeOpen ? (
                <div
                  className="absolute bottom-[calc(100%+4px)] left-0 z-30 w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-[6px] border border-[var(--color-border)] bg-[var(--color-background)] py-1 shadow-[var(--shadow-md)]"
                  role="listbox"
                  aria-label="Mode"
                >
                  {modeOptions.map((mode) => {
                    const active = mode.value === session.state.mode
                    return (
                      <button
                        type="button"
                        className={`flex w-full items-center justify-between gap-4 border-0 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--color-hover)] ${
                          active ? "bg-[var(--vscode-list-activeSelectionBackground,var(--color-hover))] text-[var(--vscode-list-activeSelectionForeground,var(--color-foreground))]" : "bg-transparent text-[var(--color-foreground)]"
                        }`}
                        key={mode.value}
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          session.setMode(mode.value)
                          setModeOpen(false)
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block font-medium">{mode.label}</span>
                          {mode.description ? (
                            <span className="mt-0.5 block max-w-[260px] whitespace-normal text-[11px] leading-[14px] text-[var(--color-muted)]">
                              {mode.description}
                            </span>
                          ) : null}
                        </span>
                        {active ? <span className="text-[11px] text-[var(--color-muted)]">✓</span> : null}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
            <ModelPicker
              value={selectedModel}
              models={session.models}
              onChange={(model) => {
                if (!activeSessionID) return
                setSessionModels((current) => ({ ...current, [activeSessionID]: model }))
              }}
              ariaLabel="Model"
              placeholder="No model"
              compact
            />
          </div>
          <button
            type="button"
            className={`absolute right-1.5 top-0 flex h-[30px] w-[30px] items-center justify-center rounded-[999px] border border-[var(--color-border)] bg-transparent p-0 hover:bg-[var(--color-hover-strong)] disabled:cursor-default ${
              busy ? "text-[var(--color-muted)]" : canSend ? "text-[var(--color-muted)]" : "text-[var(--color-muted)] opacity-55"
            }`}
            disabled={!busy && !canSend}
            onClick={send}
          aria-label={busy ? "Stop" : canSend ? "Send" : "Cannot send"}
        >
            {busy ? (
              <ArrowClockwiseIcon className="animate-spin" size={20} weight="bold" />
            ) : (
              <PaperPlaneRightIcon size={20} weight={canSend ? "fill" : "regular"} />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
