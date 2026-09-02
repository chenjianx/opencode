import { ArrowUpRight, DeviceMobile, EnvelopeSimple, Eye, EyeSlash, Globe } from "@phosphor-icons/react"
import { useEffect, useState, type FormEvent } from "react"
import raccoonWelcome from "../../assets/raccoon-welcome.png?inline"
import { RACCOON_LOGIN_URL } from "../../config"
import { useLanguage } from "../../context/language"
import { useSession } from "../../context/session"
import { useVSCode } from "../../context/vscode"

type LoginMethod = "browser" | "phone" | "email"

const loginMethods = [
  { id: "browser", label: "login.method.browser", icon: Globe },
  { id: "phone", label: "login.method.phone", icon: DeviceMobile },
  { id: "email", label: "login.method.email", icon: EnvelopeSimple },
] as const

const phoneCountryCodes = ["86", "852", "853", "81"] as const

export function LoginView() {
  const language = useLanguage()
  const session = useSession()
  const vscode = useVSCode()
  const [method, setMethod] = useState<LoginMethod>("browser")
  const [serverUrl, setServerUrl] = useState(RACCOON_LOGIN_URL)
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState<string>()
  const [nationCode, setNationCode] = useState<(typeof phoneCountryCodes)[number]>("86")
  const [phone, setPhone] = useState("")
  const [phonePassword, setPhonePassword] = useState("")
  const registerUrl = `${(serverUrl.trim() || RACCOON_LOGIN_URL).replace(/\/+$/, "")}/register`

  useEffect(() => {
    return vscode.onMessage((message) => {
      if (message.type !== "raccoonLoginFinished") return
      setLoggingIn(false)
      setError(message.error)
    })
  }, [vscode])

  const selectMethod = (next: LoginMethod) => {
    if (loggingIn) return
    setMethod(next)
    setError(undefined)
  }

  const signInWithBrowser = () => {
    setLoggingIn(true)
    setError(undefined)
    session.loginRaccoon({ method: "browser", serverUrl: serverUrl.trim() || RACCOON_LOGIN_URL })
  }

  const cancel = () => {
    setLoggingIn(false)
    session.cancelRaccoonLogin()
  }

  const passwordLoginUnavailable = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(language.t("login.passwordUnavailable"))
  }

  const signInWithPhone = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!phone.trim() || !phonePassword) return
    setLoggingIn(true)
    setError(undefined)
    session.loginRaccoon({
      method: "phone",
      serverUrl: serverUrl.trim() || RACCOON_LOGIN_URL,
      nationCode,
      phone: phone.trim(),
      password: phonePassword,
    })
  }

  return (
    <div className="login-view">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <div className="login-mascot" aria-hidden="true">
            <img src={raccoonWelcome} alt="" />
          </div>
          <div className="login-brand-copy">
            <h1 className="login-title" id="login-title">
              {language.t("login.title")}
            </h1>
            <p className="login-description">{language.t("login.description")}</p>
          </div>
        </div>

        <div className="login-methods" role="tablist" aria-label={language.t("login.method.label")}>
          {loginMethods.map((item) => {
            const Icon = item.icon
            const selected = method === item.id
            return (
              <button
                key={item.id}
                type="button"
                className="login-method"
                role="tab"
                id={`login-tab-${item.id}`}
                aria-selected={selected}
                aria-controls={`login-panel-${item.id}`}
                disabled={loggingIn}
                onClick={() => selectMethod(item.id)}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{language.t(item.label)}</span>
              </button>
            )
          })}
        </div>

        <label className="login-field">
          <span>{language.t("login.serverUrl")}</span>
          <input
            className="login-input"
            type="url"
            name="serverUrl"
            value={serverUrl}
            placeholder={RACCOON_LOGIN_URL}
            disabled={loggingIn}
            onChange={(event) => setServerUrl(event.currentTarget.value)}
          />
        </label>

        <div
          className="login-panel"
          id="login-panel-browser"
          role="tabpanel"
          aria-labelledby="login-tab-browser"
          hidden={method !== "browser"}
        >
          <p className="login-browser-help">
            <ArrowUpRight size={15} aria-hidden="true" />
            <span>{language.t("login.browserHelp")}</span>
          </p>
          <button type="button" className="login-primary" disabled={loggingIn} onClick={signInWithBrowser}>
            <span>{loggingIn ? language.t("login.waiting") : language.t("login.signIn")}</span>
            {!loggingIn ? <ArrowUpRight size={16} weight="bold" aria-hidden="true" /> : null}
          </button>
          {loggingIn ? (
            <button type="button" className="login-secondary" onClick={cancel}>
              {language.t("login.cancel")}
            </button>
          ) : null}
        </div>

        <form
          className="login-panel"
          id="login-panel-phone"
          role="tabpanel"
          aria-labelledby="login-tab-phone"
          hidden={method !== "phone"}
          onSubmit={signInWithPhone}
        >
          <label className="login-field">
            <span>{language.t("login.phone")}</span>
            <span className="login-phone-field">
              <select
                className="login-input login-country-code"
                name="nationCode"
                aria-label={language.t("login.nationCode")}
                value={nationCode}
                disabled={loggingIn}
                onChange={(event) => setNationCode(event.currentTarget.value as (typeof phoneCountryCodes)[number])}
              >
                {phoneCountryCodes.map((code) => (
                  <option value={code} key={code}>
                    +{code}
                  </option>
                ))}
              </select>
              <input
                className="login-input"
                type="tel"
                name="phone"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder={language.t("login.phonePlaceholder")}
                value={phone}
                disabled={loggingIn}
                required
                onChange={(event) => setPhone(event.currentTarget.value)}
              />
            </span>
          </label>
          <PasswordField
            id="login-phone-password"
            value={phonePassword}
            disabled={loggingIn}
            onChange={setPhonePassword}
          />
          <p className="login-forgot">{language.t("login.forgotPassword")}</p>
          <button type="submit" className="login-primary" disabled={loggingIn || !phone.trim() || !phonePassword}>
            {loggingIn ? language.t("login.signingIn") : language.t("login.passwordSignIn")}
          </button>
          {loggingIn ? (
            <button type="button" className="login-secondary" onClick={cancel}>
              {language.t("login.cancel")}
            </button>
          ) : null}
        </form>

        <form
          className="login-panel"
          id="login-panel-email"
          role="tabpanel"
          aria-labelledby="login-tab-email"
          hidden={method !== "email"}
          onSubmit={passwordLoginUnavailable}
        >
          <label className="login-field">
            <span>{language.t("login.email")}</span>
            <input
              className="login-input"
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              placeholder={language.t("login.emailPlaceholder")}
              required
            />
          </label>
          <PasswordField id="login-email-password" />
          <p className="login-forgot">{language.t("login.forgotPassword")}</p>
          <button type="submit" className="login-primary">
            {language.t("login.passwordSignIn")}
          </button>
        </form>

        {error ? (
          <div className="login-error" role="alert">
            {error}
          </div>
        ) : null}

        <p className="login-register">
          <span>{language.t("login.noAccount")}</span>
          <a href={registerUrl} target="_blank" rel="noreferrer">
            {language.t("login.register")}
          </a>
        </p>
      </section>
    </div>
  )
}

function PasswordField(props: { id: string; value?: string; disabled?: boolean; onChange?: (value: string) => void }) {
  const language = useLanguage()
  const [visible, setVisible] = useState(false)

  return (
    <label className="login-field">
      <span>{language.t("login.password")}</span>
      <span className="login-password-field">
        <input
          className="login-input"
          id={props.id}
          type={visible ? "text" : "password"}
          name="password"
          autoComplete="current-password"
          placeholder={language.t("login.passwordPlaceholder")}
          value={props.value}
          disabled={props.disabled}
          required
          onChange={props.onChange ? (event) => props.onChange?.(event.currentTarget.value) : undefined}
        />
        <button
          type="button"
          className="login-password-toggle"
          aria-label={language.t(visible ? "login.hidePassword" : "login.showPassword")}
          aria-pressed={visible}
          disabled={props.disabled}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeSlash size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
        </button>
      </span>
    </label>
  )
}
