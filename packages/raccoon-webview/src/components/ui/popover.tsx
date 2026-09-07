import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"

export function Popover(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  className: string
  menuClassName: string
  portal?: boolean
  placement?: "top" | "bottom" | "auto"
  width?: number
  trigger: (api: { open: boolean; toggle: () => void }) => ReactNode
  children: (api: { close: () => void }) => ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>()

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!props.open) return
      if (rootRef.current?.contains(event.target as Node)) return
      if (menuRef.current?.contains(event.target as Node)) return
      props.onOpenChange(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      props.onOpenChange(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [props])

  useLayoutEffect(() => {
    if (!props.open || !props.portal) return
    const update = () => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(props.width ?? rect.width, window.innerWidth - 16)
      const menu = menuRef.current
      const border = menu ? getComputedStyle(menu) : undefined
      const menuHeight = menu
        ? menu.scrollHeight + Number.parseFloat(border?.borderTopWidth ?? "0") + Number.parseFloat(border?.borderBottomWidth ?? "0")
        : 0
      const spaceAbove = rect.top - 12
      const spaceBelow = window.innerHeight - rect.bottom - 12
      const placeAbove = props.placement === "top" || (props.placement === "auto" && spaceBelow < menuHeight && spaceAbove > spaceBelow)
      const maxHeight = Math.max(0, placeAbove ? spaceAbove : spaceBelow)
      setMenuStyle({
        position: "fixed",
        top: placeAbove ? undefined : rect.bottom + 4,
        bottom: placeAbove ? window.innerHeight - rect.top + 4 : undefined,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        width,
        maxHeight: props.placement === "auto" ? maxHeight : undefined,
        overflowY: props.placement === "auto" && menuHeight > maxHeight ? "auto" : undefined,
        zIndex: 30,
      })
    }
    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [props.open, props.placement, props.portal, props.width])

  const menu = props.open ? (
    <div className={props.menuClassName} ref={menuRef} style={props.portal ? menuStyle : undefined}>
      {props.children({ close: () => props.onOpenChange(false) })}
    </div>
  ) : null

  return (
    <div className={props.className} ref={rootRef}>
      {props.trigger({ open: props.open, toggle: () => props.onOpenChange(!props.open) })}
      {props.portal && menu ? createPortal(menu, document.body) : menu}
    </div>
  )
}
