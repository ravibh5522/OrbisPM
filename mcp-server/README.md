# Simplify Projects MCP server

Two modes, same 28 tools:

- **Hosted (recommended)** — runs as the `mcp-server` service, served at `/mcp`.
  Users only need an API key. See [../docs/MCP_GUIDE.md](../docs/MCP_GUIDE.md).
- **Local (stdio)** — `node server.js` with `SIMPLIFY_API_KEY` (+ optional `SIMPLIFY_API_URL`, `SIMPLIFY_ORG_ID`).

Files: `tools.js` (tool definitions), `api.js` (API client), `http.js` (hosted), `server.js` (stdio).
Tests: `node test-http.js` (hosted E2E), `node test-full.js` (stdio, full surface).
