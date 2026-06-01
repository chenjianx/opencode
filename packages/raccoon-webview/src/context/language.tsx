import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { dict as en, type I18nKey } from "../i18n/en"
import { dict as zh } from "../i18n/zh"
import { dict as zhHant } from "../i18n/zh-hant"
import type { RaccoonPluginLanguage, RaccoonPluginLanguageMode } from "../protocol"
import { useVSCode } from "./vscode"

type Locale = RaccoonPluginLanguage

type LanguageContextValue = {
  locale: Locale
  t: (key: I18nKey, params?: Record<string, string | number | boolean | undefined>) => string
}

const dicts: Record<Locale, Record<I18nKey, string>> = {
  en,
  "zh-Hans": zh,
  "zh-Hant": zhHant,
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

function normalizeLocale(value: string | undefined): Locale {
  const normalized = value?.toLowerCase()
  if (!normalized) return "en"
  if (normalized.startsWith("zh-tw") || normalized.startsWith("zh-hk") || normalized.startsWith("zh-mo")) return "zh-Hant"
  if (normalized.startsWith("zh")) return "zh-Hans"
  return "en"
}

function resolveLocale(mode: RaccoonPluginLanguageMode | undefined, fallback: string | undefined) {
  if (!mode || mode === "auto") return normalizeLocale(fallback)
  if (mode === "zh-Hans" || mode === "zh-Hant" || mode === "en") return mode
  return "en"
}

function resolveTemplate(text: string, params?: Record<string, string | number | boolean | undefined>) {
  if (!params) return text
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    params[key] === undefined ? match : String(params[key]),
  )
}

export function LanguageProvider(props: { children: ReactNode }) {
  const vscode = useVSCode()
  const [locale, setLocale] = useState<Locale>(() =>
    resolveLocale(
      vscode.getState<{ pluginLanguageMode?: RaccoonPluginLanguageMode; pluginLanguage?: RaccoonPluginLanguage }>()?.pluginLanguageMode ??
        (vscode.getState<{ pluginLanguage?: RaccoonPluginLanguage }>()?.pluginLanguage ?? "auto"),
      typeof navigator === "undefined" ? undefined : navigator.language,
    ),
  )

  useEffect(() => {
    return vscode.onMessage((message) => {
      if (message.type === "state") setLocale(resolveLocale(message.state.pluginLanguageMode, message.state.pluginLanguage))
    })
  }, [vscode])

  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en" : "zh-CN"
  }, [locale])

  const value = useMemo<LanguageContextValue>(() => {
    const dict = dicts[locale] ?? dicts.en
    return {
      locale,
      t: (key, params) => resolveTemplate(dict[key] ?? key, params),
    }
  }, [locale])

  return <LanguageContext.Provider value={value}>{props.children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error("useLanguage must be used within a LanguageProvider")
  return context
}
