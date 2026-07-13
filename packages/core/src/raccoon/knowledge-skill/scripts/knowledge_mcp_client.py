#!/usr/bin/env python3
"""Raccoon MCP knowledge client.

Small stdlib-only CLI for the JSON-RPC endpoints used by Continue Raccoon's
cloud knowledge-base context provider.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

def opencode_auth_paths() -> list[Path]:
    # The app rebrands its XDG data dir to "raccoon" (see packages/core/src/global.ts),
    # so auth.json lives under .../raccoon/. Keep "opencode" as a fallback for older installs.
    paths: list[Path] = []
    if os.environ.get("OPENCODE_AUTH_PATH"):
        paths.append(Path(os.environ["OPENCODE_AUTH_PATH"]).expanduser())
    for app in ("raccoon", "opencode"):
        if os.environ.get("XDG_DATA_HOME"):
            paths.append(Path(os.environ["XDG_DATA_HOME"]).expanduser() / app / "auth.json")
        paths.append(Path.home() / ".local/share" / app / "auth.json")
    return paths


def env(name: str, required: bool = True) -> str | None:
    value = os.environ.get(name)
    if required and not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def read_json_file(path: Path) -> Any | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON in {path}: {exc}") from exc


def load_opencode_raccoon_auth() -> dict[str, Any] | None:
    for path in opencode_auth_paths():
        data = read_json_file(path)
        if not isinstance(data, dict):
            continue
        auth = data.get("raccoon")
        if isinstance(auth, dict):
            return auth
    return None


def refresh_access_token(base_url: str, refresh_token: str) -> str:
    request = Request(
        f"{base_url.rstrip('/')}/api/plugin/auth/v1/refresh",
        data=json.dumps({"refresh_token": refresh_token}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {exc.code}: {body}") from exc
    except URLError as exc:
        raise SystemExit(f"Request failed: {exc.reason}") from exc

    access_token = payload.get("data", {}).get("access_token")
    if not access_token:
        raise SystemExit("Failed to refresh Raccoon access token")
    return access_token


def fetch_org_code(base_url: str, access_token: str) -> str | None:
    """Recover the organization scope id from the user_info endpoint.

    Mirrors the TypeScript login plugin's orgCodeFromUser: only orgs[0].code is a valid
    org code. A personal account without an org stays unscoped (personal endpoint).
    """
    request = Request(
        f"{base_url.rstrip('/')}/api/plugin/auth/v1/user_info",
        headers={"Authorization": f"Bearer {access_token}"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, json.JSONDecodeError):
        return None
    orgs = (payload.get("data") or {}).get("orgs") or []
    if orgs and isinstance(orgs[0], dict):
        code = orgs[0].get("code")
        if code:
            return str(code)
    return None


def resolve_config() -> tuple[str, str, str | None, str | None, bool]:
    auth = load_opencode_raccoon_auth()
    base_url = env("RACCOON_BASE_URL", required=False)
    access_token = env("RACCOON_ACCESS_TOKEN", required=False)
    # Organization scope id for the X-Org-Code header. Never derived from accountId, which
    # degrades to the user id for personal accounts; only orgs[0].code is a valid org code.
    org_code = env("RACCOON_ORG_CODE", required=False)
    refresh_token = None
    expired = False

    if auth:
        access_token = access_token or auth.get("access")
        base_url = base_url or auth.get("enterpriseUrl")
        org_code = org_code or auth.get("orgCode")
        refresh_token = auth.get("refresh")
        expires = auth.get("expires")
        expired = isinstance(expires, (int, float)) and expires <= (time.time() * 1000)

    if not base_url:
        raise SystemExit(
            "Could not resolve Raccoon base URL. Set RACCOON_BASE_URL or log in to opencode.",
        )
    if not access_token:
        raise SystemExit(
            "Could not resolve Raccoon access token. Set RACCOON_ACCESS_TOKEN or log in to opencode.",
        )

    return base_url, access_token, org_code, refresh_token, expired


def endpoint(base_url: str, org_code: str | None) -> str:
    base = base_url.rstrip("/")
    path = (
        "/api/plugin/mcp/org/know/v1/message"
        if org_code
        else "/api/plugin/mcp/know/v1/message"
    )
    return f"{base}{path}"


def rpc_call(tool_name: str, arguments: dict[str, Any] | None) -> dict[str, Any]:
    base_url, access_token, org_code, refresh_token, expired = resolve_config()
    if expired and refresh_token:
        access_token = refresh_access_token(base_url, refresh_token)

    # Older logins persisted only accountId (no orgCode). Recover the org code from
    # user_info using the now-valid access token so the request targets the organization
    # endpoint without a re-login. Done here (not in resolve_config) to reuse the single
    # refresh above and avoid spending a rotating refresh token twice.
    if not org_code:
        org_code = fetch_org_code(base_url, access_token)

    first_error: HTTPError | None = None
    first_body = ""
    for candidate_org_code in ([org_code, None] if org_code else [None]):
        try:
            return rpc_call_with_auth(
                tool_name,
                arguments,
                base_url,
                access_token,
                candidate_org_code,
                refresh_token,
                False,
            )
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            if first_error is None:
                first_error = exc
                first_body = body
            if exc.code == 404 and candidate_org_code:
                continue
            if "authorization invalid" in body.lower() and refresh_token:
                access_token = refresh_access_token(base_url, refresh_token)
                return rpc_call_with_auth(
                    tool_name,
                    arguments,
                    base_url,
                    access_token,
                    candidate_org_code,
                    refresh_token,
                    False,
                )
            raise SystemExit(f"HTTP {exc.code}: {body}") from exc

    if first_error:
        raise SystemExit(f"HTTP {first_error.code}: {first_body}") from first_error
    raise SystemExit("Request failed")


def rpc_call_with_auth(
    tool_name: str,
    arguments: dict[str, Any] | None,
    base_url: str,
    access_token: str,
    org_code: str | None,
    refresh_token: str | None,
    expired: bool,
    retried: bool = False,
) -> dict[str, Any]:
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {access_token}",
    }
    if org_code:
        headers["X-Org-Code"] = org_code

    params: dict[str, Any] = {"name": tool_name}
    if arguments is not None:
        params["arguments"] = arguments

    payload = {
        "jsonrpc": "2.0",
        "id": str(uuid.uuid4()),
        "method": "tools/call",
        "params": params,
    }

    url = endpoint(base_url, org_code)
    maybe_print_request(url, headers, payload)

    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        if not retried and refresh_token and (expired or "authorization invalid" in body.lower()):
            new_access_token = refresh_access_token(base_url, refresh_token)
            return rpc_call_with_auth(
                tool_name,
                arguments,
                base_url,
                new_access_token,
                org_code,
                refresh_token,
                False,
                retried=True,
            )
        raise
    except URLError as exc:
        raise SystemExit(f"Request failed: {exc.reason}") from exc


def parse_content(response: dict[str, Any]) -> list[Any]:
    if "error" in response:
        raise SystemExit(json.dumps(response["error"], ensure_ascii=False, indent=2))

    parsed: list[Any] = []
    for item in response.get("result", {}).get("content", []) or []:
        if item.get("type") != "text":
            continue
        text = item.get("text", "")
        if not text:
            continue
        value = json.loads(text)
        if isinstance(value, list):
            parsed.extend(value)
        else:
            parsed.append(value)
    return parsed


def print_json(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))


def sanitized_request(url: str, headers: dict[str, str], payload: dict[str, Any]) -> dict[str, Any]:
    safe_headers = dict(headers)
    if "Authorization" in safe_headers:
        safe_headers["Authorization"] = "Bearer <redacted>"

    return {
        "time": datetime.datetime.now(datetime.UTC).isoformat(),
        "url": url,
        "headers": safe_headers,
        "body": payload,
    }


def maybe_print_request(url: str, headers: dict[str, str], payload: dict[str, Any]) -> None:
    if os.environ.get("RACCOON_PRINT_REQUEST") != "1":
        return

    request_log = sanitized_request(url, headers, payload)

    print(
        json.dumps(request_log, ensure_ascii=False, indent=2),
        file=sys.stderr,
    )


def cmd_list(args: argparse.Namespace) -> None:
    response = rpc_call("list-knows", {})
    print_json(response if args.raw else parse_content(response))


def cmd_retrieve(args: argparse.Namespace) -> None:
    internal_urls = args.internal_url or []
    if args.positional_internal_url:
        internal_urls.append(args.positional_internal_url)
    if not internal_urls:
        knows = parse_content(rpc_call("list-knows", {}))
        internal_urls = [
            item.get("internal_url")
            for item in knows
            if isinstance(item, dict) and item.get("internal_url")
        ][:1]
    query = args.query or args.positional_query

    if not query:
        raise SystemExit("retrieve requires a query")
    if not internal_urls:
        raise SystemExit("No knowledge bases found")

    response = rpc_call(
        "retrieve-knows",
        {
            "internal_urls": json.dumps(internal_urls, ensure_ascii=False),
            "query": query,
        },
    )
    if args.raw:
        print_json(response)
        return

    chunks = parse_content(response)
    if not chunks and args.fallback_search:
        chunks = [
            {
                "name": item.get("name"),
                "internal_url": item.get("internal_url"),
                "path": item.get("path"),
                "file_type": item.get("file_type"),
                "chunk": f"Matched knowledge file: {item.get('path', '')}{item.get('name', '')}",
                "retrieval_type": "file_search_fallback",
            }
            for item in parse_content(
                rpc_call(
                    "search-know-files",
                    {
                        "query": query,
                        "limit": args.fallback_limit,
                    },
                ),
            )
        ]
    print_json(chunks)


def cmd_search_files(args: argparse.Namespace) -> None:
    response = rpc_call(
        "search-know-files",
        {
            "query": args.query or "",
            "limit": args.limit,
        },
    )
    print_json(response if args.raw else parse_content(response))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Call Raccoon cloud knowledge MCP tools.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list", help="List knowledge bases")
    list_parser.add_argument("--raw", action="store_true", help="Print raw JSON-RPC")
    list_parser.add_argument(
        "--print-request",
        action="store_true",
        help="Print sanitized request details to stderr",
    )
    list_parser.set_defaults(func=cmd_list)

    retrieve_parser = subparsers.add_parser(
        "retrieve",
        help="Retrieve chunks from one or more knowledge bases",
    )
    retrieve_parser.add_argument(
        "positional_internal_url",
        nargs="?",
        help="Knowledge base internal_url",
    )
    retrieve_parser.add_argument("positional_query", nargs="?", help="Question")
    retrieve_parser.add_argument(
        "--internal-url",
        action="append",
        help="Knowledge base internal_url; repeat for multiple bases",
    )
    retrieve_parser.add_argument("--query", help="Question")
    retrieve_parser.add_argument(
        "--no-fallback-search",
        action="store_false",
        dest="fallback_search",
        help="Do not fallback to search-know-files when retrieve-knows returns no chunks",
    )
    retrieve_parser.add_argument(
        "--fallback-limit",
        type=int,
        default=20,
        help="Maximum file search results for fallback",
    )
    retrieve_parser.add_argument("--raw", action="store_true", help="Print raw JSON-RPC")
    retrieve_parser.add_argument(
        "--print-request",
        action="store_true",
        help="Print sanitized request details to stderr",
    )
    retrieve_parser.set_defaults(fallback_search=True)
    retrieve_parser.set_defaults(func=cmd_retrieve)

    search_parser = subparsers.add_parser(
        "search-files",
        help="Search cloud knowledge files with search-know-files",
    )
    search_parser.add_argument("--query", default="", help="Search query")
    search_parser.add_argument("--limit", type=int, default=20, help="Maximum results")
    search_parser.add_argument("--raw", action="store_true", help="Print raw JSON-RPC")
    search_parser.add_argument(
        "--print-request",
        action="store_true",
        help="Print sanitized request details to stderr",
    )
    search_parser.set_defaults(func=cmd_search_files)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if getattr(args, "print_request", False):
        os.environ["RACCOON_PRINT_REQUEST"] = "1"
    args.func(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
