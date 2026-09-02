import raccoonWelcome from "../../../assets/raccoon-welcome.png?inline"
import { useLanguage } from "../../../context/language"

export function WelcomeEmpty() {
  const language = useLanguage()

  return (
    <div className="welcome-empty">
      <div className="welcome-content">
        <section className="welcome-brand">
          <div className="welcome-mascot-wrap" aria-hidden="true">
            <img className="welcome-mascot" src={raccoonWelcome} alt="" />
          </div>
          <div className="welcome-brand-copy">
            <h1 className="welcome-title">{language.t("welcome.title")}</h1>
            <p className="welcome-greeting">{language.t("welcome.greeting")}</p>
          </div>
        </section>

        <section className="welcome-shortcuts" aria-label={language.t("welcome.tipsTitle")}>
          <h2 className="welcome-shortcuts-title">{language.t("welcome.tipsTitle")}</h2>
          <div className="welcome-shortcut-list">
            <div className="welcome-shortcut-row">
              <div className="welcome-shortcut-keys">
                <kbd className="welcome-kbd">⌘ L</kbd>
                <span aria-hidden="true">/</span>
                <kbd className="welcome-kbd">Ctrl L</kbd>
              </div>
              <div className="welcome-shortcut-copy">
                <strong>{language.t("welcome.tipAwaken")}</strong>
                <span>{language.t("welcome.tipAwakenDescription")}</span>
              </div>
            </div>
            <div className="welcome-shortcut-row">
              <div className="welcome-shortcut-keys">
                <kbd className="welcome-kbd">@</kbd>
              </div>
              <div className="welcome-shortcut-copy">
                <strong>{language.t("welcome.tipContext")}</strong>
                <span>{language.t("welcome.tipContextDescription")}</span>
              </div>
            </div>
            <div className="welcome-shortcut-row">
              <div className="welcome-shortcut-keys">
                <kbd className="welcome-kbd">/</kbd>
              </div>
              <div className="welcome-shortcut-copy">
                <strong>{language.t("welcome.tipCommand")}</strong>
                <span>{language.t("welcome.tipCommandDescription")}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
