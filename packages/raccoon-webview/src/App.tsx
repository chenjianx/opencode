import { ChatView } from "./components/chat/chat-view"
import { LanguageProvider } from "./context/language"
import { SessionProvider } from "./context/session"
import { VSCodeProvider } from "./context/vscode"

function AppContent() {
  return (
    <main className="flex h-full w-full flex-col overflow-hidden bg-[var(--color-background)] px-[5px] text-[var(--color-foreground)]">
      <ChatView />
    </main>
  )
}

export default function App() {
  return (
    <VSCodeProvider>
      <LanguageProvider>
        <SessionProvider>
          <AppContent />
        </SessionProvider>
      </LanguageProvider>
    </VSCodeProvider>
  )
}
