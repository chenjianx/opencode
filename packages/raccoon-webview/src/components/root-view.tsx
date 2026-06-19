import { useEffect, useRef } from "react"
import { ChatView } from "./chat/chat-view"
import { SubAgentView } from "./chat/subagent-view"
import { HistoryView } from "./history/history-view"
import { LoginView } from "./login/login-view"
import { SettingsView } from "./settings/settings-view"
import { useLanguage } from "../context/language"
import { useSession } from "../context/session"

export function RootView() {
  const session = useSession()
  const language = useLanguage()
  // `raccoonLoggedIn` is the ground-truth auth flag computed by the extension (it reads
  // the opencode auth store). Do NOT use the provider `connected` flag here: raccoon is a
  // config-source provider and is always reported as connected regardless of login.
  const loggedIn = session.state.raccoonLoggedIn === true
  // Until the extension has sent state at least once we don't know the auth status; avoid
  // flashing the login screen before that first state arrives.
  const stateLoaded = session.state.raccoonLoggedIn !== undefined || !session.state.loading
  const wasLoggedIn = useRef(false)
  useEffect(() => {
    if (loggedIn) wasLoggedIn.current = true
  }, [loggedIn])

  if (!loggedIn) {
    if (!stateLoaded) {
      return (
        <div className="login-view">
          <p className="login-description">{language.t("login.loading")}</p>
        </div>
      )
    }
    return <LoginView expired={wasLoggedIn.current} />
  }

  if (session.state.view === "settings") return <SettingsView />
  if (session.state.view === "history") return <HistoryView onClose={() => session.showChat()} />
  if (session.state.view === "subagent") return <SubAgentView />
  return <ChatView />
}

