---
name: knowledge
description: Load this skill (via the skill tool) when the user asks to look up, search, or answer questions from Raccoon cloud knowledge bases. This is a skill, not a directly callable tool.
---

# Knowledge

Load this skill to answer questions from Raccoon cloud knowledge bases.

> This is a **skill**, loaded via the `skill` tool. It is not a callable tool by
> itself. After loading, run the bundled client below with `bash`.

The bundled client provides these knowledge-base operations:

- `list-knows` lists selectable knowledge bases.
- `retrieve-knows` retrieves chunks from one or more selected knowledge bases.
- Personal requests use `/api/plugin/mcp/know/v1/message`.
- Organization requests use `/api/plugin/mcp/org/know/v1/message` with `X-Org-Code`.

## Required Inputs

This skill reads the active OpenCode Raccoon login from the local auth store by
default:

- `~/.local/share/raccoon/auth.json` (or `~/.local/share/opencode/auth.json` as a fallback)
- or `XDG_DATA_HOME/raccoon/auth.json` (or `XDG_DATA_HOME/opencode/auth.json`)
- or `OPENCODE_AUTH_PATH` if set

It uses the `raccoon` entry from that file:

- `access` as the bearer token
- `enterpriseUrl` as the base URL

Organization scope is resolved automatically. The skill reads `orgCode` from the login
auth store, and if it is missing (older logins), recovers it from the user's first
organization via the user_info endpoint. When an organization scope is present, requests
use the organization endpoint with `X-Org-Code`; a personal account with no organization
falls back to the personal endpoint.

Environment overrides are still supported:

- `RACCOON_BASE_URL`
- `RACCOON_ACCESS_TOKEN`
- `RACCOON_ORG_CODE` (takes precedence over the stored `orgCode`)

If the user names a knowledge base but does not provide an `internal_url`, list knowledge bases first and match by name. If no base is specified, list knowledge bases first and use the first returned `internal_url`.

## Workflow

1. If the target knowledge base is unknown, or the user just asks a general question, list knowledge bases and retrieve from the first returned `internal_url`:

   ```bash
   python3 scripts/knowledge_mcp_client.py retrieve --query "<question>"
   ```

2. If you need to confirm the available knowledge bases first, run:

   ```bash
   python3 scripts/knowledge_mcp_client.py list
   ```

3. If the user provided a specific base, retrieve from that base:

   ```bash
   python3 scripts/knowledge_mcp_client.py retrieve --internal-url "<internal_url>" --query "<question>"
   ```

   For multiple knowledge bases, repeat `--internal-url`:

   ```bash
   python3 scripts/knowledge_mcp_client.py retrieve --internal-url "<url-1>" --internal-url "<url-2>" --query "<question>"
   ```

4. Answer using only retrieved chunks unless the user explicitly asks for general knowledge.
5. Cite the source `name` and `internal_url` when available.
6. If no chunks are returned, say that no relevant knowledge was found.

## Output Handling

The client prints normalized JSON:

- `list` returns an array of knowledge bases.
- `retrieve` returns an array of chunks with `name`, `internal_url`, and `chunk`.
- `raw` can be used for debugging the underlying JSON-RPC response.

Use `--print-request` when debugging. It prints the request URL, headers, and
JSON-RPC body to stderr with `Authorization` redacted.

Do not expose access tokens in responses, logs, or citations.

## API Details

Read `references/api.md` for the JSON-RPC request contract.
