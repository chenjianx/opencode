import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { DotsThreeVerticalIcon, PencilIcon, TrashIcon, DownloadIcon } from "@phosphor-icons/react"
import { useLanguage } from "../../context/language"
import { useSession } from "../../context/session"
import { Button } from "../ui"

function sessionTitle(title: string, untitled: string) {
  if (!title || title === "New session") return untitled
  if (/^New session - \d{4}-\d{2}-\d{2}T/.test(title)) return untitled
  return title
}

function fuzzyMatch(value: string, query: string) {
  let index = 0
  for (const char of query) {
    index = value.indexOf(char, index)
    if (index === -1) return false
    index += 1
  }
  return true
}

export function HistoryView(props: { onClose: () => void }) {
  const language = useLanguage()
  const session = useSession()
  const [query, setQuery] = useState("")
  const [menuSessionID, setMenuSessionID] = useState<string | undefined>()
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number }>()
  const [renameSessionID, setRenameSessionID] = useState<string | undefined>()
  const [renameTitle, setRenameTitle] = useState("")
  const rootSessions = useMemo(() => session.sessions.filter((item) => !item.parentID), [session.sessions])
  const filteredSessions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rootSessions
    return rootSessions.filter((item) => {
      const title = sessionTitle(item.title, language.t("history.untitled")).toLowerCase()
      const agent = (item.agent ?? language.t("history.defaultAgent")).toLowerCase()
      const id = item.id.toLowerCase()
      return (
        title.includes(needle) ||
        agent.includes(needle) ||
        id.includes(needle) ||
        fuzzyMatch(title, needle) ||
        fuzzyMatch(agent, needle) ||
        fuzzyMatch(id, needle)
      )
    })
  }, [language, query, rootSessions])
  const menuSession = rootSessions.find((item) => item.id === menuSessionID)

  const openMenu = (sessionID: string, event: { clientX: number; clientY: number }) => {
    setMenuSessionID(sessionID)
    setMenuPosition({
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - 168)),
      top: Math.max(8, Math.min(event.clientY + 4, window.innerHeight - 128)),
    })
  }

  useEffect(() => {
    if (!menuSessionID) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-history-menu]")) return
      setMenuSessionID(undefined)
      setMenuPosition(undefined)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setMenuSessionID(undefined)
      setMenuPosition(undefined)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [menuSessionID])

  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--color-background)] px-[5px]">
      <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--color-border)] px-[5px] pb-[10px] pt-[12px]">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[14px] font-semibold text-[var(--color-foreground)]">
              {language.t("history.title")}
            </div>
            <div className="mt-0.5 text-[12px] text-[var(--color-muted)]">
              {language.t("history.sessions", { count: filteredSessions.length })}
            </div>
          </div>
          <Button className="shrink-0" onClick={props.onClose} aria-label={language.t("common.back")}>
            {language.t("common.back")}
          </Button>
        </div>
        <input
          className="h-[28px] w-full min-w-0 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-input)] px-2 text-[13px] text-[var(--color-input-foreground)] outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-focus)]"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={language.t("history.search")}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-2">
        {rootSessions.length === 0 ? <div className="px-1 py-3 text-[12px] text-[var(--color-muted)]">{language.t("history.empty")}</div> : null}
        {filteredSessions.length === 0 && rootSessions.length > 0 ? (
          <div className="px-1 py-3 text-[12px] text-[var(--color-muted)]">{language.t("history.searchEmpty")}</div>
        ) : null}
        {filteredSessions.map((item) => (
          <div
            className="group flex w-full min-w-0 items-start gap-2 rounded-[6px] px-3 py-2 text-left text-[var(--color-foreground)] hover:bg-[var(--color-hover)]"
            key={item.id}
            onContextMenu={(event) => {
              event.preventDefault()
              openMenu(item.id, event)
            }}
          >
            <button
              type="button"
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left"
              onClick={() => {
                session.selectSession(item.id)
                props.onClose()
              }}
            >
              <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium text-[var(--color-foreground)]">
                {sessionTitle(item.title, language.t("history.untitled"))}
              </span>
              <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-[var(--color-muted)]">
                {item.agent ?? language.t("history.defaultAgent")} · {new Date(item.updatedAt).toLocaleString()}
              </span>
            </button>
            <button
              type="button"
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border-0 bg-transparent p-0 text-[var(--color-muted)] hover:bg-[var(--color-hover)] ${menuSessionID === item.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
              onClick={(event) => {
                event.stopPropagation()
                openMenu(item.id, event)
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                openMenu(item.id, event)
              }}
              aria-label={language.t("history.menu")}
            >
              <DotsThreeVerticalIcon size={16} />
            </button>
          </div>
        ))}
      </div>
      {menuSession && menuPosition
        ? createPortal(
            <div
              data-history-menu
              className="fixed z-30 flex min-w-[160px] flex-col rounded-[6px] border border-[var(--color-border)] bg-[var(--color-background)] p-1 shadow-[var(--shadow-md)]"
              style={{ left: menuPosition.left, top: menuPosition.top }}
            >
              <button
                type="button"
                className="flex items-center gap-2 rounded-[6px] border-0 bg-transparent px-2 py-1.5 text-left text-[13px] text-[var(--color-foreground)] hover:bg-[var(--color-hover)]"
                onClick={() => {
                  setRenameSessionID(menuSession.id)
                  setRenameTitle(sessionTitle(menuSession.title, language.t("history.untitled")))
                  setMenuSessionID(undefined)
                  setMenuPosition(undefined)
                }}
              >
                <PencilIcon size={14} />
                {language.t("history.rename")}
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-[6px] border-0 bg-transparent px-2 py-1.5 text-left text-[13px] text-[var(--color-foreground)] hover:bg-[var(--color-hover)]"
                onClick={() => {
                  session.exportSession(menuSession.id)
                  setMenuSessionID(undefined)
                  setMenuPosition(undefined)
                }}
              >
                <DownloadIcon size={14} />
                {language.t("history.export")}
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-[6px] border-0 bg-transparent px-2 py-1.5 text-left text-[13px] text-[var(--color-error)] hover:bg-[var(--color-hover)]"
                onClick={() => {
                  session.deleteSession(menuSession.id)
                  setMenuSessionID(undefined)
                  setMenuPosition(undefined)
                }}
              >
                <TrashIcon size={14} />
                {language.t("history.delete")}
              </button>
            </div>,
            document.body,
          )
        : null}
      {renameSessionID ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[color-mix(in_srgb,var(--color-background)_70%,transparent)] px-4">
          <div className="w-full max-w-[420px] rounded-[6px] border border-[var(--color-border)] bg-[var(--color-background)] p-4 shadow-[var(--shadow-md)]">
            <div className="text-[14px] font-semibold text-[var(--color-foreground)]">{language.t("history.rename")}</div>
            <input
              className="mt-3 h-[32px] w-full rounded-[6px] border border-[var(--color-border)] bg-[var(--color-input)] px-2 text-[13px] text-[var(--color-input-foreground)] outline-none focus:border-[var(--color-focus)]"
              value={renameTitle}
              onChange={(event) => setRenameTitle(event.target.value)}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                className="px-3 py-1.5 text-[13px]"
                onClick={() => {
                  setRenameSessionID(undefined)
                  setRenameTitle("")
                }}
              >
                {language.t("common.cancel")}
              </Button>
              <Button
                className="px-3 py-1.5 text-[13px]"
                onClick={() => {
                  if (!renameSessionID) return
                  const title = renameTitle.trim()
                  if (!title) return
                  session.renameSession(renameSessionID, title)
                  setRenameSessionID(undefined)
                  setRenameTitle("")
                }}
              >
                {language.t("common.save")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
