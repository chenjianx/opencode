import { useState } from "react"
import { useLanguage } from "../../context/language"
import { Popover } from "./popover"

export function ReasoningPicker(props: { value?: string; variants: string[]; onChange: (variant: string) => void }) {
  const language = useLanguage()
  const [open, setOpen] = useState(false)
  if (props.variants.length === 0) return null
  const label = props.value ? props.value.charAt(0).toUpperCase() + props.value.slice(1) : language.t("reasoningPicker.default")

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      className="relative inline-flex w-max min-w-0 max-w-full flex-none"
      menuClassName="overflow-hidden rounded-[6px] border border-[var(--color-border)] bg-[var(--color-background)] shadow-[var(--shadow-md)]"
      portal
      placement="top"
      width={150}
      trigger={(api) => (
        <button
          type="button"
          className="flex h-[26px] max-w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-[4px] border border-[var(--color-border)] bg-transparent px-2 text-[12px] font-medium leading-none text-[var(--color-foreground)] hover:bg-[var(--color-hover)] focus:outline focus:outline-1 focus:outline-offset-[-1px] focus:outline-[var(--color-focus)]"
          aria-label={language.t("reasoningPicker.label")}
          aria-haspopup="listbox"
          aria-expanded={api.open}
          onClick={api.toggle}
        >
          <span className="whitespace-nowrap">{label}</span>
          <span className="text-[11px] text-[var(--color-muted)]">▾</span>
        </button>
      )}
    >
      {(api) => (
        <div className="py-1" role="listbox" aria-label={language.t("reasoningPicker.label")}>
          {props.variants.map((variant) => {
            const active = variant === props.value
            return (
              <button
                type="button"
                className={`flex w-full cursor-pointer items-center border-0 bg-transparent px-3 py-1.5 text-left text-[12px] text-[var(--color-foreground)] hover:bg-[var(--color-hover)] ${active ? "bg-[var(--color-hover)] font-semibold" : ""}`}
                role="option"
                aria-selected={active}
                key={variant}
                onClick={() => {
                  props.onChange(variant)
                  api.close()
                }}
              >
                {variant.charAt(0).toUpperCase() + variant.slice(1)}
              </button>
            )
          })}
        </div>
      )}
    </Popover>
  )
}
