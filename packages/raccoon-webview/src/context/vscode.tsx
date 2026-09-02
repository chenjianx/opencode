import { createContext, useContext, useEffect, useMemo, useRef } from "react"
import type { ReactNode } from "react"
import type { ExtensionToWebview, WebviewToExtension } from "../protocol"

type VSCodeAPI = {
  postMessage(message: WebviewToExtension): void
  getState(): unknown
  setState(state: unknown): void
}

declare global {
  function acquireVsCodeApi(): VSCodeAPI
}

type VSCodeContextValue = {
  postMessage(message: WebviewToExtension): void
  onMessage(handler: (message: ExtensionToWebview) => void): () => void
  getState<T>(): T | undefined
  setState<T>(state: T): void
}

const VSCodeContext = createContext<VSCodeContextValue | undefined>(undefined)

export function messageForMockLog(message: WebviewToExtension) {
  if (message.type !== "loginRaccoon" || message.method !== "phone") return message
  return { ...message, phone: "[redacted]", password: "[redacted]" }
}

function getVSCodeAPI() {
  if (typeof acquireVsCodeApi === "function") return acquireVsCodeApi()
  return {
    postMessage: (message: WebviewToExtension) => console.log("[Raccoon] Mock postMessage", messageForMockLog(message)),
    getState: () => undefined,
    setState: () => {},
  }
}

export function VSCodeProvider(props: { children: ReactNode }) {
  const api = useRef<VSCodeAPI | null>(null)
  const handlers = useRef(new Set<(message: ExtensionToWebview) => void>())

  if (!api.current) {
    api.current = getVSCodeAPI()
  }

  useEffect(() => {
    const messageListener = (event: MessageEvent) => {
      handlers.current.forEach((handler) => handler(event.data as ExtensionToWebview))
    }

    window.addEventListener("message", messageListener)
    return () => {
      window.removeEventListener("message", messageListener)
      handlers.current.clear()
    }
  }, [])

  const value = useMemo<VSCodeContextValue>(
    () => ({
      postMessage: (message) => api.current?.postMessage(message),
      onMessage: (handler) => {
        handlers.current.add(handler)
        return () => handlers.current.delete(handler)
      },
      getState: <T,>() => api.current?.getState() as T | undefined,
      setState: <T,>(state: T) => api.current?.setState(state),
    }),
    [],
  )

  return <VSCodeContext.Provider value={value}>{props.children}</VSCodeContext.Provider>
}

export function useVSCode() {
  const context = useContext(VSCodeContext)
  if (!context) throw new Error("useVSCode must be used within a VSCodeProvider")
  return context
}
