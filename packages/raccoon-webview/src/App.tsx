import { RootView } from "./components/root-view"
import { LanguageProvider } from "./context/language"
import { SessionProvider } from "./context/session"
import { VSCodeProvider } from "./context/vscode"

export default function App() {
  return (
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <main className="flex h-full w-full flex-col overflow-hidden bg-[var(--color-background)] px-[5px] text-[var(--color-foreground)]">
            <RootView />
          </main>
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>
  )
}
