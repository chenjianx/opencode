import type { ButtonHTMLAttributes, ReactNode } from "react"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "small" | "icon"

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "ui-button ui-button--primary",
  secondary: "ui-button",
  ghost: "ui-button ui-button--ghost",
  small: "ui-button ui-button--small",
  icon: "ui-button ui-button--icon",
}

/**
 * Shared button used across the webview. Replaces the many ad-hoc `<button>`
 * elements that each re-declared the same theme-variable styling. The visual
 * style comes from the `.ui-button` classes in `styles/ui.css`, which are
 * copied verbatim from the previous per-feature CSS so there is no visual
 * regression.
 *
 * - `variant` selects the look (defaults to `secondary`, the neutral button).
 * - `icon` renders before `children`; pass only `icon` for icon-only buttons.
 * - any extra `className` is appended, so callers can still add feature-specific
 *   modifiers (e.g. dock-specific tweaks) during incremental migration.
 */
export function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant
    icon?: ReactNode
  },
) {
  const { variant = "secondary", icon, className, children, type, ...rest } = props
  const classes = `${VARIANT_CLASS[variant]} ${className ?? ""}`.trim()
  return (
    <button type={type ?? "button"} className={classes} {...rest}>
      {icon}
      {children}
    </button>
  )
}
