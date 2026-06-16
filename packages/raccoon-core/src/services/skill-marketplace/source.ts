export type ParsedSkillRepoSource =
  | {
      ok: true
      owner: string
      repo: string
      normalizedRepo: string
      cloneUrl: string
      effectiveSubpath?: string
      repositoryUrl: string
    }
  | {
      ok: false
      error: string
    }

export function parseSkillRepoSource(source: string, subpath: string | undefined): ParsedSkillRepoSource {
  const trimmed = source.trim()
  if (!trimmed) return { ok: false, error: "Skill source is required." }

  const github = parseGithubUrl(trimmed) ?? parseGithubShorthand(trimmed)
  if (!github) return { ok: false, error: "Only GitHub skill sources are supported." }

  const effectiveSubpath = subpath?.trim() || github.subpath
  return {
    ok: true,
    owner: github.owner,
    repo: github.repo,
    normalizedRepo: `${github.owner}/${github.repo}`,
    cloneUrl: `https://github.com/${github.owner}/${github.repo}.git`,
    effectiveSubpath,
    repositoryUrl: `https://github.com/${github.owner}/${github.repo}`,
  }
}

function parseGithubUrl(source: string) {
  if (!source.startsWith("https://github.com/") && !source.startsWith("http://github.com/")) return
  try {
    const url = new URL(source)
    const parts = url.pathname.split("/").filter(Boolean)
    const owner = parts[0]
    const repo = parts[1]?.replace(/\.git$/, "")
    if (!owner || !repo) return
    const treeIndex = parts.indexOf("tree")
    return {
      owner,
      repo,
      subpath: treeIndex >= 0 ? parts.slice(treeIndex + 2).join("/") || undefined : undefined,
    }
  } catch {
    return
  }
}

function parseGithubShorthand(source: string) {
  const parts = source.replace(/\.git$/, "").split("/").filter(Boolean)
  const owner = parts[0]
  const repo = parts[1]
  if (!owner || !repo) return
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return
  return {
    owner,
    repo,
    subpath: parts.slice(2).join("/") || undefined,
  }
}
