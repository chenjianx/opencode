import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { dict as en, type I18nKey } from "../i18n/en"
import { dict as zh } from "../i18n/zh"

type Locale = "en" | "zh"

type LanguageContextValue = {
  locale: Locale
  t: (key: I18nKey, params?: Record<string, string | number | boolean | undefined>) => string
}

const dicts: Record<Locale, Record<I18nKey, string>> = {
  en,
  zh,
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

function normalizeLocale(value: string | undefined): Locale {
  if (value?.toLowerCase().startsWith("zh")) return "zh"
  return "en"
}

function resolveTemplate(text: string, params?: Record<string, string | number | boolean | undefined>) {
  if (!params) return text
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    params[key] === undefined ? match : String(params[key]),
  )
}

export function LanguageProvider(props: { children: ReactNode }) {
  const [locale] = useState<Locale>(() => normalizeLocale(typeof navigator === "undefined" ? undefined : navigator.language))

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"
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
