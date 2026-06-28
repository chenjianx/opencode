# Raccoon Knowledge API

This is the JSON-RPC contract used by Continue Raccoon's
`RaccoonKnowledgeBaseContextProvider`.

## Endpoint

Personal:

```text
POST {baseUrl}/api/plugin/mcp/know/v1/message
```

Organization:

```text
POST {baseUrl}/api/plugin/mcp/org/know/v1/message
```

Organization requests require:

```http
X-Org-Code: {orgCode}
```

## Headers

```http
Content-Type: application/json
Authorization: Bearer {accessToken}
```

## List Knowledge Bases

```json
{
  "jsonrpc": "2.0",
  "id": "<uuid>",
  "method": "tools/call",
  "params": {
    "name": "list-knows",
    "arguments": {}
  }
}
```

Response content contains text JSON. Each item usually includes:

```json
{
  "name": "...",
  "internal_url": "..."
}
```

## Retrieve Knowledge

```json
{
  "jsonrpc": "2.0",
  "id": "<uuid>",
  "method": "tools/call",
  "params": {
    "name": "retrieve-knows",
    "arguments": {
      "internal_urls": "[\"<internal_url>\"]",
      "query": "<user question>"
    }
  }
}
```

Response items usually include:

```json
{
  "name": "...",
  "internal_url": "...",
  "chunk": "..."
}
```

## Search Cloud Knowledge Files

This is used by Continue Raccoon's cloud-file submenu, not by the normal
knowledge-base submenu. It is included for completeness when a user wants to
search file-level cloud knowledge entries.

```json
{
  "jsonrpc": "2.0",
  "id": "<uuid>",
  "method": "tools/call",
  "params": {
    "name": "search-know-files",
    "arguments": {
      "query": "<search text>",
      "limit": 20
    }
  }
}
```

Response items usually include:

```json
{
  "name": "...",
  "internal_url": "...",
  "path": "...",
  "file_type": "folder"
}
```
