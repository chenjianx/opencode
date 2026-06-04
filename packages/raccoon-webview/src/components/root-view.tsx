import { ChatView } from "./chat/chat-view"
import { HistoryView } from "./history/history-view"
import { SettingsView } from "./settings/settings-view"
import { useSession } from "../context/session"

export function RootView() {
  const session = useSession()
  if (session.state.view === "settings") return <SettingsView />
  if (session.state.view === "history") return <HistoryView onClose={() => session.showChat()} />
  return <ChatView />
}
