import { useEffect, useMemo, useState } from "react"
import { ArrowClockwise, CaretDown, CheckCircle, DownloadSimple, FileText, MagnifyingGlass, Trash, Warning } from "@phosphor-icons/react"
import { useLanguage } from "../../context/language"
import { useSession } from "../../context/session"
import { useVSCode } from "../../context/vscode"
import type { RaccoonMarketplaceScope, RaccoonSkillMarketplaceItem } from "../../protocol"
import { Button } from "../ui"
import { SelectField, TextInput } from "./settings-common"
import { SettingsDialog } from "./settings-dialog"

type SkillTab = "marketplace" | "installed"
type SkillCategory = "all" | "coding" | "review" | "docs" | "testing" | "workflow" | "cloud" | "other"
type InstallDraft = {
  item: RaccoonSkillMarketplaceItem
  scope: RaccoonMarketplaceScope
}

const SKILL_CATEGORIES: SkillCategory[] = ["all", "coding", "review", "docs", "testing", "workflow", "cloud", "other"]

const SKILL_CATEGORY_KEYWORDS: Array<{ category: Exclude<SkillCategory, "all" | "other">; keywords: string[] }> = [
  { category: "coding", keywords: ["code", "coding", "frontend", "backend", "typescript", "react", "api", "sdk"] },
  { category: "review", keywords: ["review", "audit", "security", "quality", "bug", "debug"] },
  { category: "docs", keywords: ["doc", "docs", "documentation", "readme", "write", "content"] },
  { category: "testing", keywords: ["test", "testing", "spec", "coverage", "playwright", "unit"] },
  { category: "workflow", keywords: ["workflow", "plan", "project", "task", "release", "commit", "pr"] },
  { category: "cloud", keywords: ["cloud", "aws", "azure", "gcp", "cloudflare", "deploy"] },
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
  const session = useSession()
  const vscode = useVSCode()
  const marketplace = session.state.skillMarketplace ?? { sources: [], items: [], installed: { project: {}, user: {} } }
  const [query, setQuery] = useState("")
  const [sourceID, setSourceID] = useState("all")
  const [category, setCategory] = useState<SkillCategory>("all")
  const [selectedID, setSelectedID] = useState<string>()
  const [draft, setDraft] = useState<InstallDraft>()
  const [pendingID, setPendingID] = useState<string>()
  const [resultError, setResultError] = useState<string>()

  useEffect(() => {
    if (
      (session.state.skillMarketplace?.items.length ?? 0) === 0 &&
      !session.state.skillMarketplace?.loading &&
      !session.state.skillMarketplace?.lastFetchedAt
    ) {
      vscode.postMessage({ type: "fetchSkillMarketplace" })
    }
  }, [
    session.state.skillMarketplace?.items.length,
    session.state.skillMarketplace?.lastFetchedAt,
    session.state.skillMarketplace?.loading,
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
      if (sourceID !== "all" && item.sourceID !== sourceID) return false
      if (!text) return true
      return `${item.title ?? ""} ${item.name} ${item.description ?? ""} ${item.sourceLabel} ${itemCategory} ${language.t(`settings.skillsMarketplace.category.${itemCategory}`)}`.toLowerCase().includes(text)
    })
  }, [category, language, marketplace.items, query, sourceID])

  const categoryCounts = useMemo(() => {
    return marketplace.items.reduce<Record<SkillCategory, number>>(
      (counts, item) => {
        const itemCategory = skillCategory(item)
        return {
          ...counts,
          [itemCategory]: counts[itemCategory] + 1,
        }
      },
      { all: marketplace.items.length, coding: 0, review: 0, docs: 0, testing: 0, workflow: 0, cloud: 0, other: 0 },
    )
  }, [marketplace.items])

  const selected = filtered.find((item) => item.id === selectedID) ?? filtered[0]
  const installedScope = selected ? installedIn(marketplace.installed, selected.name) : undefined

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
        <SelectField
          label={language.t("settings.skillsMarketplace.source")}
          value={sourceID}
          onChange={setSourceID}
          className="settings-browser-filter"
          options={[
            { value: "all", label: language.t("settings.skillsMarketplace.source.all") },
            ...marketplace.sources.map((source) => ({ value: source.id, label: source.label })),
          ]}
        />
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

      <div className="settings-browser-layout">
        <div className="settings-browser-list">
          {marketplace.loading && marketplace.items.length === 0 ? (
            <div className="settings-empty">{language.t("settings.skillsMarketplace.loadingResults")}</div>
          ) : filtered.length === 0 ? (
            <div className="settings-empty">{language.t("settings.skillsMarketplace.empty")}</div>
          ) : (
            filtered.map((item) => {
              const scope = installedIn(marketplace.installed, item.name)
              return (
                <button
                  type="button"
                  key={item.id}
                  className={`settings-browser-item ${selected?.id === item.id ? "active" : ""}`.trim()}
                  onClick={() => setSelectedID(item.id)}
                >
                  <SkillAvatar item={item} />
                  <span className="settings-browser-item-main">
                    <span className="settings-browser-item-titlerow">
                      <span className="settings-browser-item-title">{item.title ?? item.name}</span>
                      {scope ? (
                        <span className="settings-browser-installed">
                          <CheckCircle size={12} weight="fill" /> {language.t(`settings.mcpMarketplace.scope.${scope}`)}
                        </span>
                      ) : null}
                    </span>
                    <span className="settings-browser-item-description">{item.description ?? item.name}</span>
                    <span className="settings-browser-item-meta">
                      <span className="settings-browser-chip">{language.t(`settings.skillsMarketplace.category.${skillCategory(item)}`)}</span>
                      <span className="settings-browser-chip">{item.sourceLabel}</span>
                      {!item.installable ? <span className="settings-browser-chip">{language.t("settings.skillsMarketplace.notInstallable")}</span> : null}
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="settings-browser-detail">
          {selected ? (
            <>
              <div className="settings-browser-detail-header">
                <div className="settings-browser-detail-heading">
                  <SkillAvatar item={selected} size="lg" />
                  <div className="settings-browser-detail-heading-text">
                    <h4>{selected.title ?? selected.name}</h4>
                    <p>{selected.skillDir}</p>
                  </div>
                </div>
                <div className="settings-browser-actions">
                  {installedScope ? (
                    <Button disabled={pendingID === selected.id} onClick={() => remove(selected, installedScope)} icon={<Trash size={14} weight="bold" />}>
                      {language.t("settings.skillsMarketplace.remove")}
                    </Button>
                  ) : (
                    <Button
                      disabled={!selected.installable || pendingID === selected.id}
                      onClick={() => setDraft({ item: selected, scope: "project" })}
                      icon={<DownloadSimple size={14} weight="bold" />}
                    >
                      {language.t("settings.skillsMarketplace.install")}
                    </Button>
                  )}
                </div>
              </div>
              <p className="settings-browser-description">{selected.description ?? language.t("settings.skillsMarketplace.noDescription")}</p>
              <div className="settings-browser-tags">
                <span>{language.t(`settings.skillsMarketplace.category.${skillCategory(selected)}`)}</span>
                <span>{selected.sourceLabel}</span>
                <span>{selected.name}</span>
                <span>{selected.installable ? language.t("settings.skillsMarketplace.installable") : language.t("settings.skillsMarketplace.notInstallable")}</span>
              </div>
              {selected.repositoryUrl ? (
                <div className="settings-browser-links">
                  <a href={selected.repositoryUrl}>{language.t("settings.skillsMarketplace.repository")}</a>
                </div>
              ) : null}
              <div className="settings-browser-transport">
                <div>
                  <div className="settings-browser-transport-title">{language.t("settings.skillsMarketplace.source")}</div>
                  <code>{selected.repoSource}</code>
                  <p>{selected.skillDir}</p>
                </div>
                <div>
                  <div className="settings-browser-transport-title">{language.t("settings.skillsMarketplace.installPreview")}</div>
                  <div className="settings-skill-path-grid">
                    <span>{language.t("settings.mcpMarketplace.scope.project")}</span>
                    <code>{installPath(selected, "project")}</code>
                    <span>{language.t("settings.mcpMarketplace.scope.user")}</span>
                    <code>{installPath(selected, "user")}</code>
                  </div>
                </div>
              </div>
              {selected.warnings?.length ? (
                <div className="settings-browser-transport settings-browser-warning-block">
                  <div>
                    <div className="settings-browser-transport-title">
                      <Warning size={13} weight="fill" /> {language.t("settings.skillsMarketplace.warnings")}
                    </div>
                    {selected.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="settings-empty">{language.t("settings.skillsMarketplace.empty")}</div>
          )}
        </div>
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
  const session = useSession()
  const vscode = useVSCode()
  const installed = session.state.skillInstalled ?? { skills: [] }
  const [pendingID, setPendingID] = useState<string>()
  const [error, setError] = useState<string>()
  const [expandedID, setExpandedID] = useState<string>()

  useEffect(() => {
    if (!session.state.skillInstalled?.loading && session.state.skillInstalled?.skills === undefined) {
      vscode.postMessage({ type: "fetchSkillInstalled" })
    }
  }, [session.state.skillInstalled?.loading, session.state.skillInstalled?.skills, vscode])

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
                  <span className="settings-browser-installed-scope">{language.t(`settings.mcpMarketplace.scope.${skill.scope}`)}</span>
                  <span className="settings-browser-installed-type">{skill.id}</span>
                </button>
                <div className="settings-browser-installed-actions">
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
  const hue = avatarHue(props.item.id)
  return (
    <span
      className={`settings-browser-avatar ${props.size === "lg" ? "lg" : ""}`.trim()}
      style={{
        background: `hsl(${hue} 60% 50% / 0.18)`,
        color: `hsl(${hue} 70% 70%)`,
        borderColor: `hsl(${hue} 60% 50% / 0.35)`,
      }}
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
        <pre>{props.draft.scope === "project" ? `.opencode/skills/${props.draft.item.name}` : `~/.config/opencode/skills/${props.draft.item.name}`}</pre>
      </div>
      {props.error ? <div className="settings-dialog-error">{props.error}</div> : null}
    </SettingsDialog>
  )
}

function installedIn(
  installed: { project: Record<string, unknown>; user: Record<string, unknown> },
  name: string,
): RaccoonMarketplaceScope | undefined {
  if (installed.project[name]) return "project"
  if (installed.user[name]) return "user"
  return undefined
}

function installPath(item: RaccoonSkillMarketplaceItem, scope: RaccoonMarketplaceScope) {
  if (scope === "project") return `.opencode/skills/${item.name}`
  return `~/.config/opencode/skills/${item.name}`
}

function avatarHue(id: string) {
  let hash = 0
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) % 360
  return hash
}

function skillCategory(item: RaccoonSkillMarketplaceItem): Exclude<SkillCategory, "all"> {
  const text = `${item.name} ${item.title ?? ""} ${item.description ?? ""} ${item.skillDir}`.toLowerCase()
  return SKILL_CATEGORY_KEYWORDS.find((entry) => entry.keywords.some((keyword) => text.includes(keyword)))?.category ?? "other"
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
