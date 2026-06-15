export type SkillFrontmatter = {
  name?: string
  description?: string
}

export function parseSkillFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}

  const lines = (match[1] ?? "").split(/\r?\n/)
  const result: Record<string, string> = {}

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ""
    const scalar = line.match(/^([A-Za-z0-9_-]+):\s*([>|])[-+]?\s*$/)
    if (scalar) {
      const block: string[] = []
      while (index + 1 < lines.length) {
        const next = lines[index + 1] ?? ""
        if (next.trim() && !/^\s/.test(next)) break
        block.push(next)
        index++
      }
      result[scalar[1] ?? ""] = cleanBlock(block, scalar[2] === ">")
      continue
    }

    const simple = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!simple) continue
    result[simple[1] ?? ""] = cleanScalar(simple[2] ?? "")
  }

  return {
    name: result.name,
    description: result.description,
  }
}

function cleanScalar(value: string) {
  return value.trim().replace(/^["']|["']$/g, "")
}

function cleanBlock(lines: string[], folded: boolean) {
  const nonEmpty = lines.filter((line) => line.trim())
  const indent = Math.min(
    ...nonEmpty.map((line) => {
      const match = line.match(/^\s*/)
      return match?.[0].length ?? 0
    }),
  )
  const stripped = lines.map((line) => line.slice(Math.min(indent, line.length))).join("\n").trim()
  if (!folded) return stripped
  return stripped
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .join("\n")
}
