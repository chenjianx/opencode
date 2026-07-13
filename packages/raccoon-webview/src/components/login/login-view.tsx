import { useEffect, useState } from "react"
import { useLanguage } from "../../context/language"
import { useSession } from "../../context/session"
import { useVSCode } from "../../context/vscode"
import { RACCOON_LOGIN_URL } from "../../config"
import { TextField } from "../settings/settings-common"
import { RaccoonLogo } from "../ui"

export function LoginView() {
  const language = useLanguage()
  const session = useSession()
  const vscode = useVSCode()
  const [serverUrl, setServerUrl] = useState(RACCOON_LOGIN_URL)
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    return vscode.onMessage((message) => {
      if (message.type !== "raccoonLoginFinished") return
      setLoggingIn(false)
      setError(message.error)
    })
  }, [vscode])

  const signIn = () => {
    setLoggingIn(true)
    setError(undefined)
    session.loginRaccoon(serverUrl.trim() || RACCOON_LOGIN_URL)
  }

  const cancel = () => {
    setLoggingIn(false)
    session.cancelRaccoonLogin()
  }

  return (
    <div className="login-view">
      <div className="login-card">
        <div className="login-brand">
          <RaccoonLogo />
          <h1 className="login-title">{language.t("login.title")}</h1>
          <p className="login-description">{language.t("login.description")}</p>
        </div>

        <div className="login-form">
          <TextField
            label={language.t("login.serverUrl")}
            value={serverUrl}
            placeholder={RACCOON_LOGIN_URL}
            disabled={loggingIn}
            onChange={setServerUrl}
          />
          {error ? <div className="login-error">{error}</div> : null}
        </div>

        <div className="login-actions">
          <button type="button" className="login-primary" disabled={loggingIn} onClick={signIn}>
            {loggingIn ? language.t("login.waiting") : language.t("login.signIn")}
          </button>
          {loggingIn ? (
            <button type="button" className="login-secondary" onClick={cancel}>
              {language.t("login.cancel")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
