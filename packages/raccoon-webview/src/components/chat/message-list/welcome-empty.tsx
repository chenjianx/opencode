import { useLanguage } from "../../../context/language"
import { RACCOON_LOGIN_URL } from "../../../config"
import { RaccoonLogo } from "../../ui"

// Empty-state shown inside the chat message list when a session has no visible
// messages (first login, or a freshly created session). Purely informational:
// brand, greeting, and a few usage tips. The prompt input remains below, so the
// user flows straight into a conversation by typing.
export function WelcomeEmpty() {
  const language = useLanguage()
  return (
    <div className="welcome-empty">
      <div className="welcome-card">
        <div className="welcome-brand">
          <RaccoonLogo className="welcome-logo" size={44} />
          <h1 className="welcome-title">{language.t("welcome.title")}</h1>
        </div>
        <p className="welcome-greeting">{language.t("welcome.greeting")}</p>
        <div className="welcome-tips">
          <p className="welcome-tips-title">{language.t("welcome.tipsTitle")}</p>
          <ul className="welcome-list">
            <li>{renderTip(language.t("welcome.tipAwaken", { key: "⌘L" }), "⌘L")}</li>
            <li>{renderTip(language.t("welcome.tipContext", { key: "@" }), "@")}</li>
            <li>{renderTip(language.t("welcome.tipCommand", { key: "/" }), "/")}</li>
          </ul>
        </div>
        <p className="welcome-footer">
          <a href={RACCOON_LOGIN_URL} target="_blank" rel="noreferrer">
            {language.t("welcome.footerLink")}
          </a>
          <span>{language.t("welcome.footerSuffix")}</span>
        </p>
      </div>
    </div>
  )
}

// Split the translated tip on its `{{key}}` token so the shortcut renders inside
// a <kbd>. The token is already interpolated to the raw symbol by t(), so we
// split on that symbol and wrap it.
function renderTip(text: string, key: string) {
  const index = text.indexOf(key)
  if (index === -1) return text
  return (
    <>
      {text.slice(0, index)}
      <kbd className="welcome-kbd">{key}</kbd>
      {text.slice(index + key.length)}
    </>
  )
}
