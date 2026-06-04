import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Permission } from "@/permission"
import type { Info } from "@/agent/agent"
import PROMPT_ASK from "@/agent/prompt/ask.txt"

// raccoon_change - extraction layer: the read-only "ask" agent and its bash ruleset
// moved out of src/agent/agent.ts so the upstream file keeps a single spread seam.

// Read-only bash rules for the ask agent: allow inspection commands, deny anything
// that can mutate state (pipes, redirects, writes, git mutations).
const READ_ONLY_BASH = {
  "*": "deny",
  "cat *": "allow",
  "head *": "allow",
  "tail *": "allow",
  "less *": "allow",
  "ls *": "allow",
  "tree *": "allow",
  "pwd *": "allow",
  "echo *": "allow",
  "wc *": "allow",
  "which *": "allow",
  "type *": "allow",
  "file *": "allow",
  "diff *": "allow",
  "du *": "allow",
  "df *": "allow",
  "date *": "allow",
  "uname *": "allow",
  "whoami *": "allow",
  "printenv *": "allow",
  "man *": "allow",
  "grep *": "allow",
  "rg *": "allow",
  "ag *": "allow",
  "sort *": "allow",
  "uniq *": "allow",
  "cut *": "allow",
  "tr *": "allow",
  "jq *": "allow",
  "git *": "deny",
  "git log *": "allow",
  "git show *": "allow",
  "git diff *": "allow",
  "git status *": "allow",
  "git blame *": "allow",
  "git rev-parse *": "allow",
  "git rev-list *": "allow",
  "git ls-files *": "allow",
  "git ls-tree *": "allow",
  "git ls-remote *": "allow",
  "git shortlog *": "allow",
  "git describe *": "allow",
  "git cat-file *": "allow",
  "git name-rev *": "allow",
  "git stash list *": "allow",
  "git tag -l *": "allow",
  "git branch --list *": "allow",
  "git branch -a *": "allow",
  "git branch -r *": "allow",
  "git remote -v *": "allow",
  "gh *": "ask",
  "*\n*": "deny",
  "*<(*": "deny",
  "*|*": "deny",
  "*;*": "deny",
  "*&&*": "deny",
  "*&*": "deny",
  "*$(*": "deny",
  "*`*": "deny",
  "*>*": "deny",
  "* > *": "deny",
  "*>>*": "deny",
  "* >> *": "deny",
  "*>|*": "deny",
  "* >| *": "deny",
  "sort -o *": "deny",
  "sort * -o *": "deny",
  "sort --output*": "deny",
  "sort * --output*": "deny",
} satisfies Record<string, PermissionV1.Action>

export type BuildContext = {
  defaults: PermissionV1.Rule[]
  user: PermissionV1.Rule[]
  readonlyExternalDirectory: Record<string, "allow" | "ask" | "deny">
}

/**
 * Build the raccoon-specific built-in agents, keyed by name, to be spread into
 * the upstream agents map in src/agent/agent.ts.
 */
export const build = (ctx: BuildContext): Record<string, Info> => {
  const { defaults, user, readonlyExternalDirectory } = ctx
  return {
    ask: {
      name: "ask",
      description: "Get answers and explanations without making changes to the codebase.",
      prompt: PROMPT_ASK,
      options: {},
      permission: Permission.merge(
        defaults,
        Permission.fromConfig({
          "*": "deny",
          read: {
            "*": "allow",
            "*.env": "ask",
            "*.env.*": "ask",
            "*.env.example": "allow",
          },
          grep: "allow",
          glob: "allow",
          list: "allow",
          skill: "allow",
          question: "allow",
          webfetch: "allow",
          websearch: "allow",
          external_directory: readonlyExternalDirectory,
        }),
        user,
        Permission.fromConfig({
          edit: "deny",
          bash: READ_ONLY_BASH,
        }),
        user.filter((rule) => rule.action === "deny"),
      ),
      mode: "primary",
      native: true,
    },
  }
}

export * as RaccoonAgents from "./agents"
