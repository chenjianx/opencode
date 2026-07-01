<!--
  Built-in skill. Name and description are registered in code at
  packages/core/src/plugin/skill.ts. The body below becomes the skill's content.
-->

# Installing MCP servers and skills

Use this when the user asks, in natural language, to **install / add / 安装 /
新增** an MCP server or a skill by name (e.g. "装个 playwright 的 mcp",
"add the github mcp", "安装 pdf 处理的 skill"). The Raccoon marketplace ships
its catalog on GitHub; you install by fetching that catalog and then editing
config / cloning the skill directory yourself. There is no install API to call.

After any change here, config is loaded once at startup and is **not**
hot-reloaded — tell the user to quit and restart Raccoon for it to take effect.

## Where things live

| Target             | Scope   | Location                                                                       |
| ------------------ | ------- | ------------------------------------------------------------------------------ |
| MCP server         | project | `./opencode.jsonc` or `./opencode.json` (walk up from cwd to the worktree root)|
| MCP server         | user    | `~/.config/opencode/opencode.jsonc`, `opencode.json`, or `config.json`         |
| Skill              | project | `.opencode/skills/<name>/SKILL.md`                                             |
| Skill              | user    | `~/.config/opencode/skills/<name>/SKILL.md`                                    |

Default to **project** scope unless the user says "globally" / "for all
projects" / "全局". If the target config file has both `.jsonc` and `.json`,
edit the one that already exists; otherwise create `opencode.json`.

## Installing an MCP server

1. Fetch the catalog:
   `https://raw.githubusercontent.com/chenjianx/raccoon-marketplace/main/mcps/marketplace.yaml`
2. It is `{ items: [ { id, name, description, url, content, parameters } ] }`.
   Match the user's request against `id` / `name` / `description`. If several
   match, show the top candidates and ask which one; if none match, say so and
   offer to add it manually from a package name or URL the user provides.
3. `content` is either a JSON **string** or an array of install methods, each
   with a `content` JSON string. Parse it and pick a method Raccoon can run:
   - `{"command":"npx","args":["-y","<pkg>", ...],"env":{...}}` → local package
   - `{"command":"uvx","args":["<pkg>", ...],"env":{...}}` → local package
   - `{"type":"streamable-http"|"http"|"sse","url":"..."}` → remote endpoint

   Ignore `docker` / `node` / `python` / raw-binary methods — Raccoon cannot
   reconstruct those from a package identifier. If an entry only ships those,
   tell the user it is not auto-installable.
4. Write the server under the config file's `mcp` object, keyed by the item
   `id` (normalize to `[A-Za-z0-9._-]`, collapsing other runs to `-`):

   ```jsonc
   {
     "mcp": {
       "playwright": {
         "type": "local",
         "command": ["npx", "-y", "@playwright/mcp"],
         "enabled": true
       },
       "some-remote": {
         "type": "remote",
         "url": "https://mcp.example.com"
       }
     }
   }
   ```

   - `command` is always an array. For npm: `["npx", "-y", "<pkg>@<version?>"]`.
     For pypi: `["uvx", "<pkg>==<version?>"]`. Preserve any extra args from the
     catalog method verbatim.
   - `type` is required (`"local"` or `"remote"`).
   - Preserve `$schema` and every field the user did not ask to change; do not
     clobber other `mcp` entries.
5. **Placeholders and secrets.** Catalog args, urls, and `env` values may carry
   `{{TOKEN}}` placeholders (and `parameters` describe them). For each required
   one — especially anything matching `TOKEN|KEY|SECRET|PASSWORD|PAT|CREDENTIAL|APIKEY`
   — ask the user for the value and substitute it before writing. Put secrets in
   `environment` (local) or `headers` (remote); never invent a value.
6. Remind the user to restart Raccoon.

## Installing a skill

1. Fetch the skill catalog:
   `https://raw.githubusercontent.com/chenjianx/raccoon-marketplace/main/skills/marketplace.yaml`
   Shape: `{ items: [ { id, name, description, category } ] }`. The skill lives
   at the `skills/<id>` subdirectory of the repo.
2. Match the request against `id` / `name` / `description`; the `id` must match
   `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$` to be installable.
3. Sparse-checkout just that directory into a temp dir, then copy it to the
   target skills root (`.opencode/skills/` for project, `~/.config/opencode/skills/`
   for user). Refuse to overwrite an existing skill of the same name.

   ```bash
   tmp=$(mktemp -d)
   git clone --depth 1 --filter=blob:none --no-checkout \
     https://github.com/chenjianx/raccoon-marketplace "$tmp"
   git -C "$tmp" sparse-checkout init --cone
   git -C "$tmp" sparse-checkout set skills/<id>
   git -C "$tmp" checkout --force HEAD
   # verify skills/<id>/SKILL.md exists, then copy into place:
   mkdir -p <skills-root>
   cp -R "$tmp/skills/<id>" <skills-root>/<id>
   rm -rf "$tmp"
   ```

4. Verify `SKILL.md` is present in the checked-out directory before copying; if
   it is missing, the entry is not a valid skill — report that and stop. Do not
   copy any skill that contains symlinks.
5. Remind the user to restart Raccoon.

## Notes

- These catalogs are fetched live from GitHub. If a fetch fails (offline, rate
  limit), say so rather than guessing package names or URLs.
- For MCP config field shapes beyond the basics here, or to confirm an exact
  shape, defer to the `customize-opencode` skill and the JSON schema at
  <https://opencode.ai/config.json>.
