import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArrowClockwiseIcon, ImageIcon, PaperPlaneRightIcon, PaperclipIcon, ShieldCheckIcon, ShieldSlashIcon, XIcon } from "@phosphor-icons/react"
import { useSession } from "../../../context/session"
import { useLanguage } from "../../../context/language"
import type { RaccoonFileAttachment, RaccoonSlashCommand } from "../../../protocol"
import { useVSCode } from "../../../context/vscode"
import { ModelPicker } from "../../ui/model-picker"
import {
  hasGitChangesMention,
  hasTerminalMention,
  mentionGroupText,
  mentionQuery,
  mentionText,
  textAttachment,
  useFileMention,
} from "./file-mention"
import { modeLabel, requestContext, slashQuery } from "./prompt-input-utils"
import { usePromptAttachments } from "./use-prompt-attachments"
import { PromptCommandList, PromptMentionList, PromptModePicker } from "./prompt-popovers"
import { ReasoningPicker } from "../../ui/reasoning-picker"

function PromptDragOverlay(props: { active: boolean }) {
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

function PromptAttachments(props: {
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


export function PromptInput() {
  const session = useSession()
  const { t } = useLanguage()
  const vscode = useVSCode()
  const modeRef = useRef<HTMLDivElement>(null)
  const commandRef = useRef<HTMLDivElement>(null)
  const mentionRef = useRef<HTMLDivElement>(null)
  const commandItemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const mentionItemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState("")
  const [modeOpen, setModeOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandSelected, setCommandSelected] = useState(0)
  const { attachments, dragging, handlePaste, dragHandlers, removeAttachment, openAttachment, clear: clearAttachments } =
    usePromptAttachments((attachment) =>
      session.openImage({ url: attachment.url, filename: attachment.filename, mime: attachment.mime }),
    )
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
  const selectedModel = session.conversationModel
  const canSend = session.canSend(draft, attachments)
  const busy = session.state.busy ?? false
  const commandQuery = slashQuery(draft, textareaRef.current?.selectionStart ?? draft.length)
  const atQuery = mentionQuery(draft, textareaRef.current?.selectionStart ?? draft.length)
  const mention = useFileMention(commandQuery === undefined ? atQuery : undefined)
  const commandOptions = useMemo(
    () =>
      session.slashCommands.filter((command) =>
        `${command.name} ${command.aliases?.join(" ") ?? ""} ${command.description ?? ""} ${command.source}`
          .toLowerCase()
          .includes(commandQuery ?? ""),
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
  }, [commandOpen, mention.close, mention.open, modeOpen])

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
  }, [mention.close, vscode])

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
        ? textAttachment(draft, "terminal", "terminal-output.txt", await requestContext(vscode, "terminal", sessionID))
        : undefined
      gitFile = hasGitChangesMention(draft)
        ? textAttachment(draft, "git-changes", "git-changes.txt", await requestContext(vscode, "git-changes", sessionID))
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
    clearAttachments()
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
        className="prompt-composer relative flex flex-col gap-1.5 rounded-[6px] border border-[color-mix(in_srgb,var(--color-border)_82%,var(--color-foreground))] bg-[var(--color-background)] p-0"
        {...dragHandlers}
      >
        <PromptDragOverlay active={dragging} />
        {commandVisible ? (
          <PromptCommandList
            groups={commandGroups}
            selected={commandSelected}
            containerRef={commandRef}
            itemRefs={commandItemRefs}
            onHover={setCommandSelected}
            onSelect={selectCommand}
          />
        ) : null}
        {mentionVisible ? (
          <PromptMentionList
            items={mention.items}
            selected={mention.selected}
            containerRef={mentionRef}
            itemRefs={mentionItemRefs}
            onHover={mention.setSelected}
            onSelect={selectMention}
          />
        ) : null}
        <PromptAttachments attachments={attachments} onOpen={openAttachment} onRemove={removeAttachment} />
        <textarea
          ref={textareaRef}
          className="min-h-[76px] w-full resize-none rounded-[4px] border border-transparent bg-transparent px-[7px] py-1.5 text-[13px] leading-[19px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted)]"
          style={{ height: `${minTextareaHeight}px` }}
          value={draft}
          placeholder={t("prompt.placeholder")}
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
        <div className={`relative px-1.5 pb-1.5 ${session.state.activeSessionID ? "pr-[76px]" : "pr-[40px]"}`}>
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <PromptModePicker
              options={modeOptions}
              current={currentMode}
              mode={session.state.mode}
              open={modeOpen}
              containerRef={modeRef}
              onToggle={() => setModeOpen((open) => !open)}
              onSelect={(value) => {
                session.setMode(value)
                setModeOpen(false)
              }}
            />
            <ModelPicker
              value={selectedModel}
              models={session.models}
              onChange={(model) => {
                if (!activeSessionID) return
                session.setConversationModel(activeSessionID, model)
              }}
              ariaLabel={t("prompt.model")}
              placeholder="No model"
              compact
            />
            {activeSessionID && session.conversationModel?.variants ? (
              <ReasoningPicker
                value={session.conversationVariant}
                variants={session.conversationModel.variants}
                onChange={(variant) => session.setConversationVariant(activeSessionID, variant)}
              />
            ) : null}
          </div>
          {session.state.activeSessionID ? (
            <button
              type="button"
              className={`ui-tip prompt-action-button prompt-auto-approve-button absolute right-[40px] top-0 flex h-[30px] w-[30px] items-center justify-center rounded-[999px] border p-0 transition-colors ${
                session.autoApprovePermissions
                  ? "border-[var(--color-border)] bg-[var(--color-hover-strong)] text-[var(--color-foreground)]"
                  : "border-[var(--color-border)] bg-transparent text-[var(--color-muted)] hover:bg-[var(--color-hover-strong)]"
              }`}
              aria-pressed={session.autoApprovePermissions}
              onClick={() => session.toggleAutoApprovePermissions()}
              aria-label={t("prompt.autoApprove")}
              data-tip={session.autoApprovePermissions ? t("prompt.autoApproveOn") : t("prompt.autoApproveOff")}
            >
              {session.autoApprovePermissions ? (
                <ShieldCheckIcon size={18} weight="fill" />
              ) : (
                <ShieldSlashIcon size={18} weight="regular" />
              )}
            </button>
          ) : null}
          <button
            type="button"
            className="ui-tip prompt-action-button prompt-send-button absolute right-1.5 top-0 flex h-[30px] w-[30px] items-center justify-center rounded-[999px] border border-[var(--color-border)] bg-transparent p-0 text-[var(--color-muted)] hover:bg-[var(--color-hover-strong)] disabled:cursor-default"
            disabled={!busy && !canSend}
            onClick={send}
            aria-label={busy ? t("prompt.stop") : canSend ? t("prompt.send") : t("prompt.cannotSend")}
            data-tip={busy ? t("prompt.stop") : t("prompt.send")}
          >
            {busy ? (
              <ArrowClockwiseIcon className="animate-spin" size={20} weight="bold" />
            ) : (
              <PaperPlaneRightIcon className={canSend ? undefined : "opacity-55"} size={20} weight={canSend ? "fill" : "regular"} />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
