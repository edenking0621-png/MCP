# Notion Remote MCP Server (OAuth + PKCE)

Remote MCP server that connects to Notion via OAuth and exposes a practical, enterprise-friendly tool surface. It implements Streamable HTTP transport over `POST /mcp`, MCP-compatible OAuth endpoints, PKCE, token refresh, and encrypted token storage.

## Quick Start (5 minutes)

1) Create a Notion integration
- Create a public integration in Notion.
- Add the OAuth redirect URL: `http://localhost:8787/oauth/callback`
- Enable capabilities (least-privilege):
  - Read content
  - Update content
  - Insert content
  - Read user info

2) Configure env
```bash
cp .env.example .env
```
Generate an encryption key and HMAC secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
Set:
- `TOKEN_ENC_KEY` to the generated base64 key
- `STATE_SIGNING_KEY` to another random secret
- (Optional) `TOKEN_ENC_KEY_FILE` / `STATE_SIGNING_KEY_FILE` for file-based secrets (defaults under `./data/`)
- `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET`
- `BASE_URL` (if not localhost)
- `ALLOWED_REDIRECT_URIS` for your MCP client
- `NOTION_VERSION` (default: 2025-09-03)

3) Run
```bash
npm install && npm run start
```

Server: `http://localhost:8787`

## OAuth for MCP Clients

This server is an OAuth 2.1 Authorization Server for MCP clients and uses Notion OAuth behind the scenes.

Authorization URL:
```
GET /authorize?response_type=code&client_id=mcp-cli&redirect_uri=http://localhost:3000/callback&scope=notion.read%20notion.write&state=xyz&code_challenge=...&code_challenge_method=S256
```
Token endpoint:
```
POST /token (application/x-www-form-urlencoded)
```

Supported scopes:
- `notion.read`
- `notion.write`
- `notion.admin`

Token refresh is supported via `grant_type=refresh_token`.

Dynamic client registration example:
```bash
curl -s http://localhost:8787/register \
  -H "Content-Type: application/json" \
  -d '{"client_name":"my-mcp-client","redirect_uris":["http://localhost:3000/callback"],"scope":"notion.read notion.write"}'
```

## MCP Endpoint

- `POST /mcp` (Streamable HTTP)
- `GET /mcp` returns 405 (only POST is supported)

Headers:
- `Authorization: Bearer <access_token>`
- `MCP-Protocol-Version: 2025-11-25` (optional; supported: 2025-11-25, 2025-06-18, 2025-03-26)
- `Accept: application/json, text/event-stream`

OAuth metadata:
- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-authorization-server`
- `POST /register` (dynamic client registration)

## Tool Surface

All tools validate inputs with JSON Schema and return JSON-encoded results.

| Tool | Scope | Purpose |
| --- | --- | --- |
| `notion.search` | `notion.read` | Search pages/databases |
| `notion.get_page` | `notion.read` | Retrieve a page |
| `notion.get_database` | `notion.read` | Retrieve a database/data source |
| `notion.query_database` | `notion.read` | Query database/data source rows |
| `notion.create_page` | `notion.write` | Create a page |
| `notion.update_page` | `notion.write` | Update page properties |
| `notion.append_block` | `notion.write` | Append blocks |
| `notion.list_users` | `notion.admin` | Governance: list users |
| `notion.whoami` | `notion.admin` | Governance: integration identity |

### JSON Schemas

#### `notion.search`
Input:
```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string" },
    "filter": { "type": "object", "properties": { "object": { "type": "string", "enum": ["page", "database"] } }, "additionalProperties": false },
    "sort": { "type": "object", "properties": { "direction": { "type": "string", "enum": ["ascending", "descending"] }, "timestamp": { "type": "string", "enum": ["last_edited_time", "created_time"] } }, "additionalProperties": false },
    "page_size": { "type": "integer", "minimum": 1, "maximum": 100 },
    "start_cursor": { "type": "string" }
  },
  "additionalProperties": false
}
```
Output:
```json
{
  "type": "object",
  "properties": {
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "object": { "type": "string" },
          "url": { "type": "string" },
          "title": { "type": "string" },
          "last_edited_time": { "type": "string" }
        },
        "required": ["id", "object", "url"]
      }
    },
    "next_cursor": { "type": ["string", "null"] },
    "has_more": { "type": "boolean" }
  },
  "required": ["results", "has_more"]
}
```

#### `notion.get_page`
Input:
```json
{
  "type": "object",
  "properties": {
    "page_id": { "type": "string" },
    "include_properties": { "type": "boolean", "default": false }
  },
  "required": ["page_id"],
  "additionalProperties": false
}
```
Output:
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "url": { "type": "string" },
    "created_time": { "type": "string" },
    "last_edited_time": { "type": "string" },
    "archived": { "type": "boolean" },
    "title": { "type": "string" },
    "properties": { "type": "object" }
  },
  "required": ["id", "url"]
}
```

#### `notion.get_database`
Input:
```json
{
  "type": "object",
  "properties": { "database_id": { "type": "string" }, "data_source_id": { "type": "string" } },
  "anyOf": [{ "required": ["database_id"] }, { "required": ["data_source_id"] }],
  "additionalProperties": false
}
```
Output:
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "title": { "type": "string" },
    "url": { "type": ["string", "null"] },
    "properties": { "type": "object" }
  },
  "required": ["id", "url"]
}
```

#### `notion.query_database`
Input:
```json
{
  "type": "object",
  "properties": {
    "database_id": { "type": "string" },
    "data_source_id": { "type": "string" },
    "filter": { "type": "object" },
    "sorts": { "type": "array" },
    "page_size": { "type": "integer", "minimum": 1, "maximum": 100 },
    "start_cursor": { "type": "string" }
  },
  "anyOf": [{ "required": ["database_id"] }, { "required": ["data_source_id"] }],
  "additionalProperties": false
}
```
Output:
```json
{
  "type": "object",
  "properties": {
    "results": { "type": "array" },
    "next_cursor": { "type": ["string", "null"] },
    "has_more": { "type": "boolean" }
  },
  "required": ["results", "has_more"]
}
```

#### `notion.create_page`
Input:
```json
{
  "type": "object",
  "properties": {
    "parent": { "type": "object", "properties": { "database_id": { "type": "string" }, "data_source_id": { "type": "string" }, "page_id": { "type": "string" } }, "additionalProperties": false },
    "properties": { "type": "object" },
    "children": { "type": "array" }
  },
  "required": ["parent", "properties"],
  "additionalProperties": false
}
```
Output:
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "url": { "type": "string" },
    "created_time": { "type": "string" }
  },
  "required": ["id", "url"]
}
```

#### `notion.update_page`
Input:
```json
{
  "type": "object",
  "properties": {
    "page_id": { "type": "string" },
    "properties": { "type": "object" },
    "archived": { "type": "boolean" }
  },
  "required": ["page_id"],
  "additionalProperties": false
}
```
Output:
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "url": { "type": "string" },
    "archived": { "type": "boolean" }
  },
  "required": ["id", "url"]
}
```

#### `notion.append_block`
Input:
```json
{
  "type": "object",
  "properties": {
    "block_id": { "type": "string" },
    "children": { "type": "array" }
  },
  "required": ["block_id", "children"],
  "additionalProperties": false
}
```
Output:
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "has_more": { "type": "boolean" }
  },
  "required": ["id"]
}
```

#### `notion.list_users`
Input:
```json
{
  "type": "object",
  "properties": {
    "page_size": { "type": "integer", "minimum": 1, "maximum": 100 },
    "start_cursor": { "type": "string" }
  },
  "additionalProperties": false
}
```
Output:
```json
{
  "type": "object",
  "properties": {
    "results": { "type": "array" },
    "next_cursor": { "type": ["string", "null"] },
    "has_more": { "type": "boolean" }
  },
  "required": ["results", "has_more"]
}
```

#### `notion.whoami`
Input:
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```
Output:
```json
{
  "type": "object",
  "properties": {
    "bot_id": { "type": "string" },
    "workspace_id": { "type": "string" },
    "owner": { "type": "object" }
  },
  "required": ["bot_id"]
}
```

## Examples

List tools:
```bash
curl -s http://localhost:8787/mcp \
  -H "Authorization: Bearer $MCP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Search pages:
```bash
curl -s http://localhost:8787/mcp \
  -H "Authorization: Bearer $MCP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"notion.search","arguments":{"query":"Roadmap","page_size":5}}}'
```

Create a page in a database:
```bash
curl -s http://localhost:8787/mcp \
  -H "Authorization: Bearer $MCP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"notion.create_page","arguments":{"parent":{"database_id":"YOUR_DB_ID"},"properties":{"Name":{"title":[{"text":{"content":"Q1 Plan"}}]}}}}}'
```

## Docker

```bash
docker build -t notion-mcp .
docker run --env-file .env -p 8787:8787 notion-mcp
```

## Security Notes

- OAuth 2.1 + PKCE enforced for MCP clients.
- Token storage is AES-256-GCM encrypted via `TOKEN_ENC_KEY`.
- Access tokens are short-lived; refresh tokens rotate access tokens.
- Origin allowlist for browser clients via `ALLOWED_ORIGINS`.
- Rate limiting: defaults are 120 requests/min for `/mcp` and 30 requests/min for auth endpoints.
- If encryption/state keys are not set, they are auto-generated and stored under `./data/` for local dev.

## Trade-offs / Next Steps

- Notion does not document PKCE support for its own OAuth; PKCE is enforced for MCP clients, and upstream Notion OAuth uses standard code exchange.
- Dynamic client registration stores client metadata in the encrypted store; could add client secrets and approval workflows for stricter control.
- Tool output is returned as JSON text; could add structured content types once supported.
- Add rate limiting, audit logs, and per-tenant encryption keys for stronger governance.
- For Notion API version 2025-09-03, prefer `data_source_id` for database-like operations; `database_id` is kept for backward compatibility.
