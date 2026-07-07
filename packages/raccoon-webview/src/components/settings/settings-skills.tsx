import { useEffect, useMemo, useState } from "react"
import { ArrowClockwise, CaretDown, CheckCircle, DownloadSimple, FileText, MagnifyingGlass, Trash } from "@phosphor-icons/react"
import { useLanguage } from "../../context/language"
import { useSessionConfig } from "../../context/session"
import { useVSCode } from "../../context/vscode"
import type { RaccoonMarketplaceScope, RaccoonSkillMarketplaceItem } from "../../protocol"
import { Button } from "../ui"
import { SelectField, TextInput } from "./settings-common"
import { SettingsDialog } from "./settings-dialog"
import { avatarHue, avatarStyle, installedIn } from "./utils"

type SkillTab = "marketplace" | "installed"
type SkillCategory = "all" | "data" | "development" | "observability" | "business" | "creative-media" | "search" | "productivity" | "other"
type InstallDraft = {
  item: RaccoonSkillMarketplaceItem
  scope: RaccoonMarketplaceScope
}

const SKILL_CATEGORIES: SkillCategory[] = ["all", "data", "development", "observability", "business", "creative-media", "search", "productivity", "other"]

// Categories the marketplace YAML is known to emit. Anything else falls into "other".
const KNOWN_CATEGORIES: ReadonlyArray<Exclude<SkillCategory, "all">> = [
  "data",
  "development",
  "observability",
  "business",
  "creative-media",
  "search",
  "productivity",
  "other",
]

export function SettingsSkills() {
  const language = useLanguage()
  const [tab, setTab] = useState<SkillTab>("marketplace")

  return (
    <div className="settings-browser-shell">
      <div className="settings-browser-tabs">
        <button
          type="button"
          className={`settings-browser-tab ${tab === "marketplace" ? "active" : ""}`.trim()}
          onClick={() => setTab("marketplace")}
        >
          {language.t("settings.skills.tab.marketplace")}
        </button>
        <button
          type="button"
          className={`settings-browser-tab ${tab === "installed" ? "active" : ""}`.trim()}
          onClick={() => setTab("installed")}
        >
          {language.t("settings.skills.tab.installed")}
        </button>
      </div>
      {tab === "marketplace" ? <SettingsSkillMarketplace /> : <SettingsSkillInstalled />}
    </div>
  )
}

function SettingsSkillMarketplace() {
  const language = useLanguage()
  const config = useSessionConfig()
  const vscode = useVSCode()
  const marketplace = config.skillMarketplace ?? { sources: [], items: [], installed: { project: {}, user: {} } }
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<SkillCategory>("all")
  const [draft, setDraft] = useState<InstallDraft>()
  const [pendingID, setPendingID] = useState<string>()
  const [resultError, setResultError] = useState<string>()

  useEffect(() => {
    if (
      (config.skillMarketplace?.items.length ?? 0) === 0 &&
      !config.skillMarketplace?.loading &&
      !config.skillMarketplace?.lastFetchedAt
    ) {
      vscode.postMessage({ type: "fetchSkillMarketplace" })
    }
  }, [
    config.skillMarketplace?.items.length,
    config.skillMarketplace?.lastFetchedAt,
    config.skillMarketplace?.loading,
    vscode,
  ])

  useEffect(() => {
    return vscode.onMessage((message) => {
      if (message.type === "skillMarketplaceInstallResult") {
        setPendingID(undefined)
        setResultError(message.error)
        if (message.success) setDraft(undefined)
        return
      }
      if (message.type === "skillMarketplaceRemoveResult") {
        setPendingID(undefined)
        setResultError(message.error)
      }
    })
  }, [vscode])

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    return marketplace.items.filter((item) => {
      const itemCategory = skillCategory(item)
      if (category !== "all" && itemCategory !== category) return false
      if (!text) return true
      return `${item.title ?? ""} ${item.name} ${item.description ?? ""} ${itemCategory} ${language.t(`settings.skillsMarketplace.category.${itemCategory}`)}`.toLowerCase().includes(text)
    })
  }, [category, language, marketplace.items, query])

  const categoryCounts = useMemo(() => {
    const initial = Object.fromEntries(SKILL_CATEGORIES.map((entry) => [entry, 0])) as Record<SkillCategory, number>
    initial.all = marketplace.items.length
    return marketplace.items.reduce<Record<SkillCategory, number>>((counts, item) => {
      const itemCategory = skillCategory(item)
      counts[itemCategory] += 1
      return counts
    }, initial)
  }, [marketplace.items])

  const refresh = () => {
    setResultError(undefined)
    vscode.postMessage({ type: "fetchSkillMarketplace", force: true })
  }

  const install = () => {
    if (!draft) return
    setPendingID(draft.item.id)
    setResultError(undefined)
    vscode.postMessage({ type: "installSkillMarketplaceItem", item: draft.item, options: { scope: draft.scope } })
  }

  const remove = (item: RaccoonSkillMarketplaceItem, scope: RaccoonMarketplaceScope) => {
    setPendingID(item.id)
    setResultError(undefined)
    vscode.postMessage({ type: "removeSkillMarketplaceItem", item, scope })
  }

  return (
    <section className="settings-mcp">
      <div className="settings-section-header">
        <div>
          <h3>{language.t("settings.skillsMarketplace.title")}</h3>
          <p>{language.t("settings.skillsMarketplace.subtitle")}</p>
        </div>
        <Button onClick={refresh} disabled={marketplace.loading} icon={<ArrowClockwise size={14} weight="bold" />}>
          {marketplace.loading ? language.t("settings.skillsMarketplace.loading") : language.t("settings.skillsMarketplace.refresh")}
        </Button>
      </div>

      <div className="settings-browser-toolbar">
        <div className="settings-browser-search-wrap">
          <MagnifyingGlass size={14} className="settings-browser-search-icon" />
          <TextInput
            value={query}
            onChange={setQuery}
            placeholder={language.t("settings.skillsMarketplace.search")}
            className="settings-provider-input settings-browser-search"
            ariaLabel={language.t("settings.skillsMarketplace.search")}
          />
        </div>
      </div>

      <div className="settings-browser-category-strip" aria-label={language.t("settings.skillsMarketplace.category")}>
        {SKILL_CATEGORIES.map((entry) => (
          <button
            type="button"
            key={entry}
            className={`settings-browser-category-chip ${category === entry ? "active" : ""}`.trim()}
            onClick={() => setCategory(entry)}
          >
            <span>{language.t(`settings.skillsMarketplace.category.${entry}`)}</span>
            <span>{categoryCounts[entry]}</span>
          </button>
        ))}
      </div>

      {marketplace.errors?.length ? <div className="settings-dialog-error">{marketplace.errors.join("\n")}</div> : null}
      {resultError ? <div className="settings-dialog-error">{resultError}</div> : null}

      <div className="settings-browser-result-summary">
        {marketplace.loading
          ? language.t("settings.skillsMarketplace.loadingResults")
          : language.t("settings.skillsMarketplace.resultCount", { count: filtered.length, total: marketplace.items.length })}
      </div>

      <div className="settings-browser-grid">
        {marketplace.loading && marketplace.items.length === 0 ? (
          <div className="settings-empty">{language.t("settings.skillsMarketplace.loadingResults")}</div>
        ) : filtered.length === 0 ? (
          <div className="settings-empty">{language.t("settings.skillsMarketplace.empty")}</div>
        ) : (
          filtered.map((item) => {
            const scope = installedIn(marketplace.installed, item.name)
            return (
              <div key={item.id} className="settings-browser-card">
                <div className="settings-browser-card-head">
                  <SkillAvatar item={item} />
                  <div className="settings-browser-card-heading">
                    <span className="settings-browser-card-title">{item.title ?? item.name}</span>
                    <span className="settings-browser-card-name">{item.name}</span>
                  </div>
                  {scope ? (
                    <span className="settings-browser-installed">
                      <CheckCircle size={12} weight="fill" /> {language.t(`settings.mcpMarketplace.scope.${scope}`)}
                    </span>
                  ) : null}
                </div>
                <p className="settings-browser-card-description">{item.description ?? item.name}</p>
                <div className="settings-browser-card-meta">
                  <span className="settings-browser-chip">{language.t(`settings.skillsMarketplace.category.${skillCategory(item)}`)}</span>
                  {!item.installable ? <span className="settings-browser-chip">{language.t("settings.skillsMarketplace.notInstallable")}</span> : null}
                </div>
                <div className="settings-browser-card-actions">
                  {scope ? (
                    <Button disabled={pendingID === item.id} onClick={() => remove(item, scope)} icon={<Trash size={14} weight="bold" />}>
                      {language.t("settings.skillsMarketplace.remove")}
                    </Button>
                  ) : (
                    <Button
                      disabled={!item.installable || pendingID === item.id}
                      onClick={() => setDraft({ item, scope: "project" })}
                      icon={<DownloadSimple size={14} weight="bold" />}
                    >
                      {language.t("settings.skillsMarketplace.install")}
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {draft ? (
        <InstallDialog
          draft={draft}
          installing={pendingID === draft.item.id}
          error={resultError}
          onChange={setDraft}
          onInstall={install}
          onClose={() => setDraft(undefined)}
        />
      ) : null}
    </section>
  )
}

function SettingsSkillInstalled() {
  const language = useLanguage()
  const config = useSessionConfig()
  const vscode = useVSCode()
  const installed = config.skillInstalled ?? { skills: [] }
  const [pendingID, setPendingID] = useState<string>()
  const [error, setError] = useState<string>()
  const [expandedID, setExpandedID] = useState<string>()

  useEffect(() => {
    if (!config.skillInstalled?.loading && config.skillInstalled?.skills === undefined) {
      vscode.postMessage({ type: "fetchSkillInstalled" })
    }
  }, [config.skillInstalled?.loading, config.skillInstalled?.skills, vscode])

  useEffect(() => {
    return vscode.onMessage((message) => {
      if (message.type === "skillMarketplaceRemoveResult") {
        setPendingID(undefined)
        setError(message.error)
      }
    })
  }, [vscode])

  const refresh = () => {
    setError(undefined)
    vscode.postMessage({ type: "fetchSkillInstalled" })
  }

  return (
    <section className="settings-mcp">
      <div className="settings-section-header">
        <div>
          <h3>{language.t("settings.skillsInstalled.title")}</h3>
          <p>{language.t("settings.skillsInstalled.subtitle")}</p>
        </div>
        <Button onClick={refresh} disabled={installed.loading} icon={<ArrowClockwise size={14} weight="bold" />}>
          {installed.loading ? language.t("settings.skillsInstalled.loading") : language.t("settings.skillsInstalled.refresh")}
        </Button>
      </div>

      {installed.error || error ? <div className="settings-dialog-error">{installed.error ?? error}</div> : null}
      <div className="settings-browser-installed-list">
        {installed.skills.length === 0 ? (
          <div className="settings-empty">{language.t("settings.skillsInstalled.empty")}</div>
        ) : (
          installed.skills.map((skill) => (
            <div className="settings-browser-installed-item" key={`${skill.scope}:${skill.id}`}>
              <div className="settings-browser-installed-row">
                <button
                  type="button"
                  className="settings-browser-installed-main"
                  onClick={() => setExpandedID(expandedID === `${skill.scope}:${skill.id}` ? undefined : `${skill.scope}:${skill.id}`)}
                >
                  <CaretDown
                    size={13}
                    className={`settings-browser-installed-caret ${expandedID === `${skill.scope}:${skill.id}` ? "open" : ""}`.trim()}
                  />
                  <span className="settings-browser-installed-name">{skill.name}</span>
                  <span className="settings-browser-installed-scope">
                    {skill.builtin
                      ? language.t("settings.skillsInstalled.builtin")
                      : language.t(`settings.mcpMarketplace.scope.${skill.scope}`)}
                  </span>
                  <span className="settings-browser-installed-type">{skill.id}</span>
                </button>
                <div className="settings-browser-installed-actions">
                  {skill.removable ? (
                    <Button
                      disabled={pendingID === `${skill.scope}:${skill.id}`}
                      onClick={() => {
                        setPendingID(`${skill.scope}:${skill.id}`)
                        setError(undefined)
                        vscode.postMessage({
                          type: "removeSkillMarketplaceItem",
                          item: installedItemToMarketplaceItem(skill),
                          scope: skill.scope,
                        })
                      }}
                      icon={<Trash size={14} weight="bold" />}
                    >
                      {language.t("settings.skillsInstalled.remove")}
                    </Button>
                  ) : null}
                </div>
              </div>
              {expandedID === `${skill.scope}:${skill.id}` ? (
                <div className="settings-browser-installed-detail">
                  <div className="settings-browser-transport">
                    <div>
                      <div className="settings-browser-transport-title">{language.t("settings.skillsInstalled.location")}</div>
                      <code>{skill.location}</code>
                      {skill.description ? <p>{skill.description}</p> : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function SkillAvatar(props: { item: RaccoonSkillMarketplaceItem; size?: "sm" | "lg" }) {
  return (
    <span
      className={`settings-browser-avatar ${props.size === "lg" ? "lg" : ""}`.trim()}
      style={avatarStyle(avatarHue(props.item.id))}
      aria-hidden="true"
    >
      <FileText size={props.size === "lg" ? 22 : 15} weight="bold" />
    </span>
  )
}

function InstallDialog(props: {
  draft: InstallDraft
  installing: boolean
  error?: string
  onChange: (draft: InstallDraft) => void
  onInstall: () => void
  onClose: () => void
}) {
  const language = useLanguage()
  return (
    <SettingsDialog
      titleId="settings-skill-install-title"
      title={language.t("settings.skillsMarketplace.installTitle", { name: props.draft.item.title ?? props.draft.item.name })}
      subtitle={props.draft.item.skillDir}
      onClose={props.onClose}
      className="settings-browser-install-dialog"
      footer={
        <>
          <Button onClick={props.onClose}>{language.t("common.cancel")}</Button>
          <Button disabled={props.installing} onClick={props.onInstall}>
            {props.installing ? language.t("settings.skillsMarketplace.installing") : language.t("settings.skillsMarketplace.install")}
          </Button>
        </>
      }
    >
      <SelectField
        label={language.t("settings.mcpMarketplace.scope")}
        value={props.draft.scope}
        onChange={(scope) => props.onChange({ ...props.draft, scope: scope as RaccoonMarketplaceScope })}
        options={[
          { value: "project", label: language.t("settings.mcpMarketplace.scope.project") },
          { value: "user", label: language.t("settings.mcpMarketplace.scope.user") },
        ]}
      />
      <div className="settings-browser-preview">
        <div className="settings-dialog-section-title">{language.t("settings.skillsMarketplace.installPreview")}</div>
        <pre>{props.draft.scope === "project" ? `.raccoon/skills/${props.draft.item.name}` : `~/.config/raccoon/skills/${props.draft.item.name}`}</pre>
      </div>
      {props.error ? <div className="settings-dialog-error">{props.error}</div> : null}
    </SettingsDialog>
  )
}

function skillCategory(item: RaccoonSkillMarketplaceItem): Exclude<SkillCategory, "all"> {
  const category = item.category as Exclude<SkillCategory, "all"> | undefined
  return category && KNOWN_CATEGORIES.includes(category) ? category : "other"
}

function installedItemToMarketplaceItem(skill: {
  id: string
  name: string
  description?: string
  location: string
}): RaccoonSkillMarketplaceItem {
  return {
    id: skill.id,
    name: skill.id,
    title: skill.name,
    description: skill.description,
    sourceID: "installed",
    sourceLabel: "Installed",
    repoSource: "",
    skillDir: skill.location,
    installable: true,
  }
}
