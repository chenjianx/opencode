import { useEffect, useMemo, useState } from "react"
import { ArrowClockwise, CheckCircle, CloudArrowDown, DownloadSimple, MagnifyingGlass, Package, Trash } from "@phosphor-icons/react"
import { useLanguage } from "../../context/language"
import { useSessionConfig } from "../../context/session"
import { useVSCode } from "../../context/vscode"
import type { RaccoonMarketplaceMcpItem, RaccoonMarketplaceScope } from "../../protocol"
import { Button } from "../ui"
import { SelectField, TextField, TextInput } from "./settings-common"
import { SettingsDialog } from "./settings-dialog"
import { avatarHue, avatarStyle, installedIn } from "./utils"

function McpAvatar(props: { item: RaccoonMarketplaceMcpItem; size?: "sm" | "lg" }) {
  const label = (props.item.title ?? props.item.name).trim()
  const initials = label.slice(0, 2).toUpperCase()
  return (
    <span
      className={`settings-browser-avatar ${props.size === "lg" ? "lg" : ""}`.trim()}
      style={avatarStyle(avatarHue(props.item.id))}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}

type Transport = "package" | "remote"
type MarketplaceCategory = "all" | "code" | "data" | "cloud" | "web" | "communication" | "productivity" | "other"

const MARKETPLACE_CATEGORIES: MarketplaceCategory[] = [
  "all",
  "code",
  "data",
  "cloud",
  "web",
  "communication",
  "productivity",
  "other",
]

const CATEGORY_KEYWORDS: Array<{ category: Exclude<MarketplaceCategory, "all" | "other">; keywords: string[] }> = [
  {
    category: "code",
    keywords: ["github", "gitlab", "git", "repo", "repository", "code", "filesystem", "file", "linear", "jira"],
  },
  {
    category: "data",
    keywords: ["postgres", "postgresql", "sqlite", "mysql", "database", "db", "redis", "snowflake", "bigquery", "data"],
  },
  {
    category: "cloud",
    keywords: ["aws", "cloudflare", "gcp", "google cloud", "azure", "sentry", "vercel", "docker", "kubernetes"],
  },
  {
    category: "web",
    keywords: ["browser", "fetch", "http", "web", "playwright", "puppeteer", "search", "brave", "firecrawl"],
  },
  {
    category: "communication",
    keywords: ["slack", "discord", "notion", "mail", "email", "gmail", "calendar", "linear", "jira"],
  },
  {
    category: "productivity",
    keywords: ["drive", "docs", "sheets", "calendar", "memory", "time", "todo", "task", "knowledge"],
  },
]

type InstallDraft = {
  item: RaccoonMarketplaceMcpItem
  scope: RaccoonMarketplaceScope
  transport: Transport
  environment: Record<string, string>
  headers: Record<string, string>
  variables: Record<string, string>
}

export function SettingsMcpMarketplace() {
  const language = useLanguage()
  const config = useSessionConfig()
  const vscode = useVSCode()
  const marketplace = config.mcpMarketplace ?? { items: [], installed: { project: {}, user: {} } }
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<MarketplaceCategory>("all")
  const [draft, setDraft] = useState<InstallDraft>()
  const [pendingID, setPendingID] = useState<string>()
  const [resultError, setResultError] = useState<string>()

  useEffect(() => {
    if (
      (config.mcpMarketplace?.items.length ?? 0) === 0 &&
      !config.mcpMarketplace?.loading &&
      !config.mcpMarketplace?.lastFetchedAt
    ) {
      vscode.postMessage({ type: "fetchMcpMarketplace" })
    }
  }, [
    config.mcpMarketplace?.items.length,
    config.mcpMarketplace?.lastFetchedAt,
    config.mcpMarketplace?.loading,
    vscode,
  ])

  useEffect(() => {
    return vscode.onMessage((message) => {
      if (message.type === "mcpMarketplaceInstallResult") {
        setPendingID(undefined)
        setResultError(message.error)
        if (message.success) setDraft(undefined)
        return
      }
      if (message.type === "mcpMarketplaceRemoveResult") {
        setPendingID(undefined)
        setResultError(message.error)
      }
    })
  }, [vscode])

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    return marketplace.items.filter((item) => {
      const itemCategory = marketplaceCategory(item)
      if (category !== "all" && itemCategory !== category) return false
      if (!text) return true
      return `${item.title ?? ""} ${item.name} ${item.description} ${itemCategory} ${language.t(`settings.mcpMarketplace.category.${itemCategory}`)}`.toLowerCase().includes(text)
    })
  }, [category, language, marketplace.items, query])

  const categoryCounts = useMemo(() => {
    return marketplace.items.reduce<Record<MarketplaceCategory, number>>(
      (counts, item) => {
        const itemCategory = marketplaceCategory(item)
        return {
          ...counts,
          [itemCategory]: counts[itemCategory] + 1,
        }
      },
      { all: marketplace.items.length, code: 0, data: 0, cloud: 0, web: 0, communication: 0, productivity: 0, other: 0 },
    )
  }, [marketplace.items])

  const refresh = () => {
    setResultError(undefined)
    vscode.postMessage({ type: "fetchMcpMarketplace", force: true })
  }

  const openInstall = (item: RaccoonMarketplaceMcpItem) => {
    setResultError(undefined)
    const transport: Transport = item.packages.length > 0 ? "package" : "remote"
    setDraft({
      item,
      scope: "project",
      transport,
      environment: Object.fromEntries(environmentVariables(item).map((env) => [env.name, ""])),
      headers: Object.fromEntries(remoteHeaders(item).map((header) => [header.name, ""])),
      variables: Object.fromEntries(itemVariables(item).map((entry) => [entry.name, ""])),
    })
  }

  const install = () => {
    if (!draft) return
    setPendingID(draft.item.id)
    setResultError(undefined)
    vscode.postMessage({
      type: "installMcpMarketplaceItem",
      item: draft.item,
      options: {
        scope: draft.scope,
        transport: draft.transport,
        variables: draft.variables,
        ...(draft.transport === "remote" ? { headers: draft.headers } : { environment: draft.environment }),
      },
    })
  }

  const remove = (item: RaccoonMarketplaceMcpItem, scope: RaccoonMarketplaceScope) => {
    setPendingID(item.id)
    setResultError(undefined)
    vscode.postMessage({ type: "removeMcpMarketplaceItem", item, scope })
  }

  return (
    <section className="settings-mcp">
      <div className="settings-section-header">
        <div>
          <h3>{language.t("settings.mcpMarketplace.title")}</h3>
          <p>{language.t("settings.mcpMarketplace.subtitle")}</p>
        </div>
        <Button onClick={refresh} disabled={marketplace.loading} icon={<ArrowClockwise size={14} weight="bold" />}>
          {marketplace.loading ? language.t("settings.mcpMarketplace.loading") : language.t("settings.mcpMarketplace.refresh")}
        </Button>
      </div>

      <div className="settings-browser-toolbar">
        <div className="settings-browser-search-wrap">
          <MagnifyingGlass size={14} className="settings-browser-search-icon" />
          <TextInput
            value={query}
            onChange={setQuery}
            placeholder={language.t("settings.mcpMarketplace.search")}
            className="settings-provider-input settings-browser-search"
            ariaLabel={language.t("settings.mcpMarketplace.search")}
          />
        </div>
      </div>

      <div className="settings-browser-category-strip" aria-label={language.t("settings.mcpMarketplace.category")}>
        {MARKETPLACE_CATEGORIES.map((entry) => (
          <button
            type="button"
            key={entry}
            className={`settings-browser-category-chip ${category === entry ? "active" : ""}`.trim()}
            onClick={() => setCategory(entry)}
          >
            <span>{language.t(`settings.mcpMarketplace.category.${entry}`)}</span>
            <span>{categoryCounts[entry]}</span>
          </button>
        ))}
      </div>

      {marketplace.errors?.length ? <div className="settings-dialog-error">{marketplace.errors.join("\n")}</div> : null}
      {resultError ? <div className="settings-dialog-error">{resultError}</div> : null}

      <div className="settings-browser-result-summary">
        {marketplace.loading
          ? language.t("settings.mcpMarketplace.loadingResults")
          : language.t("settings.mcpMarketplace.resultCount", { count: filtered.length, total: marketplace.items.length })}
      </div>

      <div className="settings-browser-grid">
        {marketplace.loading && marketplace.items.length === 0 ? (
          <div className="settings-empty">{language.t("settings.mcpMarketplace.loadingResults")}</div>
        ) : filtered.length === 0 ? (
          <div className="settings-empty">{language.t("settings.mcpMarketplace.empty")}</div>
        ) : (
          filtered.map((item) => {
            const scope = installedIn(marketplace.installed, item.id)
            return (
              <div key={item.id} className="settings-browser-card">
                <div className="settings-browser-card-head">
                  <McpAvatar item={item} />
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
                <p className="settings-browser-card-description">{item.description}</p>
                <div className="settings-browser-card-meta">
                  {item.packages.length > 0 ? (
                    <span className="settings-browser-chip">
                      <Package size={11} weight="bold" /> {language.t("settings.mcpMarketplace.transport.package")}
                    </span>
                  ) : null}
                  {item.remotes.length > 0 ? (
                    <span className="settings-browser-chip">
                      <CloudArrowDown size={11} weight="bold" /> {language.t("settings.mcpMarketplace.transport.remote")}
                    </span>
                  ) : null}
                  <span className="settings-browser-chip">{language.t(`settings.mcpMarketplace.category.${marketplaceCategory(item)}`)}</span>
                  {item.version ? <span className="settings-browser-chip">v{item.version}</span> : null}
                </div>
                <div className="settings-browser-card-actions">
                  {scope ? (
                    <Button
                      disabled={pendingID === item.id}
                      onClick={() => remove(item, scope)}
                      icon={<Trash size={14} weight="bold" />}
                    >
                      {language.t("settings.mcpMarketplace.remove")}
                    </Button>
                  ) : (
                    <Button
                      disabled={!canInstallItem(item) || pendingID === item.id}
                      onClick={() => openInstall(item)}
                      icon={<DownloadSimple size={14} weight="bold" />}
                    >
                      {language.t("settings.mcpMarketplace.install")}
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

function InstallDialog(props: {
  draft: InstallDraft
  installing: boolean
  error?: string
  onChange: (draft: InstallDraft) => void
  onInstall: () => void
  onClose: () => void
}) {
  const language = useLanguage()
  const item = props.draft.item
  const transport = props.draft.transport
  const hasPackage = item.packages.length > 0
  const hasRemote = item.remotes.length > 0
  const config = transport === "remote"
    ? installRemoteConfig(item, props.draft.headers, props.draft.variables)
    : installConfig(item, props.draft.environment, props.draft.variables)
  const environment = transport === "package" ? environmentVariables(item) : []
  const headers = transport === "remote" ? remoteHeaders(item) : []
  const variables = itemVariables(item)
  const requiredEnvOk = environment.filter((env) => env.isRequired || env.isSecret).every((env) => props.draft.environment[env.name]?.trim())
  const requiredHeadersOk = headers.filter((header) => header.isRequired).every((header) => props.draft.headers[header.name]?.trim())
  const requiredVariablesOk = variables.filter((entry) => entry.isRequired || entry.isSecret).every((entry) => props.draft.variables[entry.name]?.trim())
  const canInstall = requiredEnvOk && requiredHeadersOk && requiredVariablesOk
  const preview = { mcp: { [item.id]: config } }

  return (
    <SettingsDialog
      titleId="settings-mcp-install-title"
      title={language.t("settings.mcpMarketplace.installTitle", { name: item.title ?? item.name })}
      subtitle={item.name}
      onClose={props.onClose}
      className="settings-browser-install-dialog"
      footer={
        <>
          <Button onClick={props.onClose}>{language.t("common.cancel")}</Button>
          <Button disabled={!canInstall || props.installing} onClick={props.onInstall}>
            {props.installing ? language.t("settings.mcpMarketplace.installing") : language.t("settings.mcpMarketplace.install")}
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
      {hasPackage && hasRemote ? (
        <SelectField
          label={language.t("settings.mcpMarketplace.transport")}
          value={transport}
          onChange={(value) => props.onChange({ ...props.draft, transport: value as Transport })}
          options={[
            { value: "package", label: language.t("settings.mcpMarketplace.transport.package") },
            { value: "remote", label: language.t("settings.mcpMarketplace.transport.remote") },
          ]}
        />
      ) : null}
      {environment.map((env) => (
        <TextField
          key={env.name}
          label={env.description}
          value={props.draft.environment[env.name] ?? ""}
          type={env.isSecret ? "password" : "text"}
          placeholder={env.placeholder ?? env.name}
          onChange={(value) =>
            props.onChange({ ...props.draft, environment: { ...props.draft.environment, [env.name]: value } })
          }
        />
      ))}
      {headers.map((header) => (
        <TextField
          key={header.name}
          label={header.description}
          value={props.draft.headers[header.name] ?? ""}
          type={header.isSecret ? "password" : "text"}
          placeholder={header.placeholder ?? header.name}
          onChange={(value) => props.onChange({ ...props.draft, headers: { ...props.draft.headers, [header.name]: value } })}
        />
      ))}
      {variables.map((entry) => (
        <TextField
          key={entry.name}
          label={entry.description ?? entry.name}
          value={props.draft.variables[entry.name] ?? ""}
          type={entry.isSecret ? "password" : "text"}
          placeholder={entry.placeholder ?? entry.name}
          onChange={(value) =>
            props.onChange({ ...props.draft, variables: { ...props.draft.variables, [entry.name]: value } })
          }
        />
      ))}
      <div className="settings-browser-preview">
        <div className="settings-dialog-section-title">{language.t("settings.mcpMarketplace.configPreview")}</div>
        <pre>{JSON.stringify(preview, null, 2)}</pre>
      </div>
      {props.error ? <div className="settings-dialog-error">{props.error}</div> : null}
    </SettingsDialog>
  )
}

function canInstallItem(item: RaccoonMarketplaceMcpItem) {
  return supportedNpmPackage(item) !== undefined || item.remotes.some((remote) => remote.url)
}

function marketplaceCategory(item: RaccoonMarketplaceMcpItem): Exclude<MarketplaceCategory, "all"> {
  const declared = item.category?.trim().toLowerCase()
  if (declared && MARKETPLACE_CATEGORIES.includes(declared as MarketplaceCategory) && declared !== "all") {
    return declared as Exclude<MarketplaceCategory, "all">
  }
  const text = `${item.id} ${item.name} ${item.title ?? ""} ${item.description} ${item.packages.map((entry) => entry.identifier).join(" ")}`.toLowerCase()
  return CATEGORY_KEYWORDS.find((entry) => entry.keywords.some((keyword) => text.includes(keyword)))?.category ?? "other"
}

// Mirrors installer.ts so the live preview matches what gets written to disk.
function substituteTokens(text: string, variables: Record<string, string>) {
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key: string) => variables[key] ?? "")
}

function applyArgTemplate(args: string[], variables: Record<string, string>, declared: RaccoonMarketplaceMcpItem["variables"]) {
  const optional = new Set(declared.filter((entry) => !(entry.isRequired || entry.isSecret)).map((entry) => entry.name))
  const result: string[] = []
  for (const arg of args) {
    const soleToken = arg.match(/^\{\{\s*([^}]+?)\s*\}\}$/)
    const key = soleToken?.[1]
    if (key) {
      const value = variables[key]?.trim()
      if (!value && optional.has(key)) {
        const last = result[result.length - 1]
        if (last !== undefined && last.startsWith("-")) result.pop()
        continue
      }
    }
    result.push(substituteTokens(arg, variables))
  }
  return result
}

function installConfig(item: RaccoonMarketplaceMcpItem, environment: Record<string, string>, variables: Record<string, string>) {
  const pkg = supportedNpmPackage(item)
  if (pkg) {
    const clean = cleanRecord(environment)
    return {
      type: "local",
      command: pkg.runtimeArguments?.length
        ? applyArgTemplate(pkg.runtimeArguments, variables, item.variables)
        : pkg.registryType.toLowerCase() === "npm"
          ? ["npx", "-y", packageSpecifier(pkg.identifier, pkg.version)]
          : ["uvx", pythonSpecifier(pkg.identifier, pkg.version)],
      ...(Object.keys(clean).length > 0 ? { environment: clean } : {}),
    }
  }
  return { type: "local", command: [] }
}

function installRemoteConfig(item: RaccoonMarketplaceMcpItem, headers: Record<string, string>, variables: Record<string, string>) {
  const remote = item.remotes[0]
  const clean = cleanRecord(headers)
  return {
    type: "remote",
    url: remote?.url ? substituteTokens(remote.url, variables) : "",
    ...(Object.keys(clean).length > 0 ? { headers: clean } : {}),
  }
}

function supportedNpmPackage(item: RaccoonMarketplaceMcpItem) {
  return item.packages.find((pkg) => pkg.registryType.toLowerCase() === "npm" && pkg.transport?.type === "stdio")
    ?? item.packages.find((pkg) => pkg.registryType.toLowerCase() === "pypi" && pkg.transport?.type === "stdio" && pkg.runtimeHint === "uvx")
}

function packageSpecifier(identifier: string, version: string | undefined) {
  if (!version) return identifier
  return `${identifier}@${version}`
}

function pythonSpecifier(identifier: string, version: string | undefined) {
  if (!version) return identifier
  return `${identifier}==${version}`
}

function environmentVariables(item: RaccoonMarketplaceMcpItem) {
  const seen = new Set<string>()
  return item.environmentVariables.filter((env) => {
    if (!env.name || seen.has(env.name)) return false
    seen.add(env.name)
    return true
  })
}

function itemVariables(item: RaccoonMarketplaceMcpItem) {
  const seen = new Set<string>()
  return (item.variables ?? []).filter((entry) => {
    if (!entry.name || seen.has(entry.name)) return false
    seen.add(entry.name)
    return true
  })
}

function remoteHeaders(item: RaccoonMarketplaceMcpItem) {
  const seen = new Set<string>()
  return [...item.headers, ...item.remotes.flatMap((remote) => remote.headers ?? [])].filter((header) => {
    if (!header.name || seen.has(header.name)) return false
    seen.add(header.name)
    return true
  })
}

function cleanRecord(record: Record<string, string>) {
  return Object.fromEntries(Object.entries(record).filter((entry) => entry[0].trim() && entry[1].trim()))
}
