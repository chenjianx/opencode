import { CaretDown, Check } from "@phosphor-icons/react"
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { useLanguage } from "../../context/language"
import type { RaccoonPluginLanguageMode } from "../../protocol"
import { Popover } from "../ui/popover"
import { SettingsRow } from "./settings-common"

export function SettingsLanguage(props: {
  pluginLanguageMode?: RaccoonPluginLanguageMode
  onPluginLanguageChange: (language: RaccoonPluginLanguageMode) => void
}) {
  const language = useLanguage()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listboxID = useId()
  const value = props.pluginLanguageMode ?? "auto"
  const title = language.t("settings.language.plugin.title")
  const options = [
    { value: "auto", label: language.t("settings.language.plugin.auto") },
    { value: "zh-Hans", label: "简体中文" },
    { value: "zh-Hant", label: "繁體中文" },
    { value: "en", label: "English" },
  ] satisfies Array<{ value: RaccoonPluginLanguageMode; label: string }>
  const selectedIndex = Math.max(
    options.findIndex((option) => option.value === value),
    0,
  )
  const selectedLabel = options[selectedIndex]?.label ?? value

  useEffect(() => {
    if (!open) return
    optionRefs.current[activeIndex]?.focus()
  }, [activeIndex, open])

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (next) setActiveIndex(selectedIndex)
  }

  const moveActive = (event: KeyboardEvent, index: number) => {
    event.preventDefault()
    setActiveIndex((index + options.length) % options.length)
  }

  const closeAndFocus = () => {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <>
      <h3>{language.t("settings.language.title")}</h3>
      <div className="settings-card settings-model-card">
        <SettingsRow title={title} description={language.t("settings.language.plugin.description")}>
          <Popover
            open={open}
            onOpenChange={changeOpen}
            className="relative w-[160px] min-w-[120px] max-w-full"
            menuClassName="overflow-hidden rounded-[6px] border border-[var(--color-border)] bg-[var(--color-background)] py-1 shadow-[var(--shadow-md)]"
            portal
            placement="auto"
            trigger={(api) => (
              <button
                ref={triggerRef}
                type="button"
                className={`flex h-[28px] w-full items-center justify-between gap-2 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-input)] px-2 text-left text-[12px] text-[var(--color-input-foreground)] outline-none transition-colors hover:bg-[var(--color-hover)] focus-visible:border-[var(--color-focus)] ${api.open ? "border-[var(--color-focus)]" : ""}`}
                aria-label={`${title}: ${selectedLabel}`}
                aria-haspopup="listbox"
                aria-expanded={api.open}
                aria-controls={listboxID}
                onClick={api.toggle}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
                  moveActive(event, selectedIndex)
                  changeOpen(true)
                }}
              >
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-medium">
                  {selectedLabel}
                </span>
                <CaretDown
                  aria-hidden="true"
                  className={`shrink-0 text-[var(--color-muted)] transition-transform duration-150 ${api.open ? "rotate-180" : ""}`}
                  size={13}
                  weight="bold"
                />
              </button>
            )}
          >
            {() => (
              <div
                id={listboxID}
                role="listbox"
                aria-label={title}
                onKeyDown={(event) => {
                  if (event.key === "Tab") {
                    setOpen(false)
                    triggerRef.current?.focus()
                    return
                  }
                  if (event.key === "Escape") {
                    event.preventDefault()
                    event.stopPropagation()
                    closeAndFocus()
                    return
                  }
                  if (event.key === "ArrowDown") moveActive(event, activeIndex + 1)
                  if (event.key === "ArrowUp") moveActive(event, activeIndex - 1)
                  if (event.key === "Home") moveActive(event, 0)
                  if (event.key === "End") moveActive(event, options.length - 1)
                  if (event.key !== "Enter" && event.key !== " ") return
                  event.preventDefault()
                  props.onPluginLanguageChange(options[activeIndex]?.value ?? value)
                  closeAndFocus()
                }}
              >
                {options.map((option, index) => {
                  const selected = option.value === value
                  return (
                    <button
                      type="button"
                      className={`flex min-h-[32px] w-full items-center gap-2 border-0 px-2.5 py-1.5 text-left text-[12px] outline-none transition-colors hover:bg-[var(--color-hover)] focus-visible:bg-[var(--color-hover)] ${selected ? "bg-[var(--color-brand-soft)] text-[var(--color-foreground)]" : "bg-transparent text-[var(--color-foreground)]"}`}
                      role="option"
                      aria-selected={selected}
                      tabIndex={index === activeIndex ? 0 : -1}
                      ref={(element) => {
                        optionRefs.current[index] = element
                      }}
                      key={option.value}
                      onFocus={() => setActiveIndex(index)}
                      onClick={() => {
                        props.onPluginLanguageChange(option.value)
                        closeAndFocus()
                      }}
                    >
                      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                        {option.label}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`flex size-[14px] shrink-0 items-center justify-center text-[var(--color-brand)] ${selected ? "" : "opacity-0"}`}
                      >
                        <Check size={13} weight="bold" />
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </Popover>
        </SettingsRow>
      </div>
    </>
  )
}
