# Connect AI assistants to Simplify Projects (MCP)

Simplify Projects has a built-in **MCP server**. Once connected, an AI assistant
(Claude, Cursor, VS Code, ChatGPT-style agents, your own scripts) can work in your
workspace for you: *"create a task in Phoenix and assign it to Priya"*, *"what's overdue this
week?"*, *"approve the pending change requests on the API epic"*.

The assistant acts **as you**, with **your permissions**, and nothing more.

---

## 1. Get an API key (1 minute)

1. Sign in and open **Profile → API Keys**.
2. Click **New Key**, give it a name (e.g. `Claude on my laptop`).
3. Choose scopes:
   - `read` — the assistant can look but not change anything.
   - `read, write` — it can also create and edit.
4. Copy the key (starts with `opm_`). **It is shown only once.**

Organisation owners/admins can also see and revoke every key under
**Settings → API Keys**.

## 2. Connect your assistant

The server address is:

```
https://<your-domain>/mcp          (local dev: http://localhost:8000/mcp)
```

Authentication: send your key as `Authorization: Bearer opm_...` (or `X-API-Key: opm_...`).
You do **not** need to give an organisation ID — it comes from the key.

### Claude Code
```bash
claude mcp add --transport http simplify-projects https://<your-domain>/mcp \
  --header "Authorization: Bearer opm_YOUR_KEY"
```

### Claude Desktop / any client that takes a JSON config
```json
{
  "mcpServers": {
    "simplify-projects": {
      "type": "http",
      "url": "https://<your-domain>/mcp",
      "headers": { "Authorization": "Bearer opm_YOUR_KEY" }
    }
  }
}
```
(Clients that only support local programs can use the bundled stdio server instead:
`command: node`, `args: ["/path/to/mcp-server/server.js"]`,
`env: { SIMPLIFY_API_URL, SIMPLIFY_API_KEY }`.)

### Cursor / VS Code / others
Add a remote (HTTP) MCP server with the URL above and the `Authorization` header.

### Quick check with curl
```bash
curl -s https://<your-domain>/mcp \
  -H "Authorization: Bearer opm_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 3. What you can ask for

| Area | Tools |
|---|---|
| Projects | `list_projects`, `get_project`, `list_project_members`, `list_org_members` |
| Tasks | `list_tasks`, `get_task`, `create_task`, `update_task`, `delete_task` |
| Subtasks (up to 4 levels) | `create_task` with `parent_task_id`, `list_task_tree`, `get_task_tree` |
| Comments | `add_comment`, `list_comments` |
| Review & approval | `submit_task_for_review`, `complete_task`, `propose_change`, `list_change_requests`, `approve_change_request`, `reject_change_request` |
| Announcements | `list_announcements`, `create_announcement`, `update_announcement`, `delete_announcement` |
| Dashboards & stats | `dashboard_stats`, `my_tasks`, `project_dashboard`, `project_analytics` (summary / velocity / cfd), `org_analytics` |

### Example prompts
- "List my projects and tell me which has the most blocked tasks."
- "In Project Phoenix, create a high-priority task *Fix login bug* due 2026-12-01 and add a subtask *Write regression test*."
- "Propose changing the priority of *Update documentation* to critical because of the customer escalation."
- "Approve all pending change requests in Phoenix that only change the priority."
- "Post an announcement: *Release freeze starts Friday*, pinned."
- "Give me the dashboard stats for the whole organisation."

## 4. How permissions work

- A key acts **as its owner**. Everything the web app checks for you is checked for the key too.
  A *member* key can create tasks in the projects they belong to, but gets *forbidden* on other
  projects, on announcements, on creating projects, and so on.
- A key only works in **one organisation** — the one it was created in.
- **Review rules apply.** If a field needs review, the assistant proposes a change request and a
  reviewer approves it, exactly like in the app. You cannot approve your own request.
- Keys cannot create or manage other keys.
- `read` scope = read-only. Even a `read, write` key never exceeds its owner's role.

## 5. Staying safe

- Treat a key like a password. Do not paste it into chats, commit it to git, or share it.
- Create one key per tool/device so you can revoke a single one.
- Lost or leaked? **Profile → API Keys → delete** (or ask an admin). It stops working immediately.
- Use `read` keys for assistants that only need to report.

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `401 Missing API key` | The `Authorization` header is not being sent. Re-check client config. |
| `401 Invalid or expired API key` | Key was revoked, expired or mistyped. Create a new one. |
| `403 insufficient scope: write required` | The key is `read`-only. Create a `read, write` key. |
| `403 API key is not valid for this org` | The key belongs to another organisation. |
| `403 insufficient permissions` | Your role cannot do this in the app either. Ask an admin. |
| `400 … is not a valid date` | Use `YYYY-MM-DD` or an ISO timestamp. |
| `429 rate limit exceeded` | Limit is 300 requests/minute per client. Slow down and retry. |
| Tools not showing up | Restart the client after adding the server. |

---

## For operators

- Service: `mcp-server` (Node, stateless Streamable HTTP) behind Kong at `/mcp`; health at `/mcp/health`.
- It holds no secrets: each request carries the caller's key and is forwarded to the API,
  which does all authentication, RBAC and org isolation.
- The API exposes `GET /api/v1/key-info` so the server can resolve a key's org.
- Kong rate-limits `/mcp` to 300 req/min per client IP. Terminate TLS at your load balancer.
- Tests: `cd mcp-server && node test-http.js` (hosted, via Kong) and `node test-full.js` (stdio).
