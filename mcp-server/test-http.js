// E2E test of the HOSTED MCP server (http://localhost:8000/mcp) with a real MCP client.
// Creates temporary keys through the real API (as a member and as an admin) and removes them.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const API = process.env.SIMPLIFY_API_URL || "http://localhost:8000";
const ORG = "dd000000-0000-4000-a000-000000000001", PHX = "dd000000-0000-4000-a000-000000000301", AUR = "dd000000-0000-4000-a000-000000000302";
let pass = 0, fail = 0;
const check = (l, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${!c && d ? "\n        " + String(d).slice(0, 250) : ""}`); };
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const login = async (email) => (await j(await fetch(`${API}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "Demo@Acme2026!" }) }))).access_token;
async function mkKey(email, name, scopes) {
  const t = await login(email);
  const r = await j(await fetch(`${API}/api/v1/orgs/${ORG}/api-keys`, { method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, scopes }) }));
  return { raw: r.raw_key, id: r.api_key.id, tok: t };
}
async function connect(key) {
  const c = new Client({ name: "t", version: "1" });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${API}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
  return c;
}
const call = async (c, name, args = {}) => { const r = await c.callTool({ name, arguments: args }); let js = null; try { js = JSON.parse(r.content[0].text); } catch {} return { err: !!r.isError, text: r.content[0].text, js }; };
const un = (x) => (x && !Array.isArray(x) ? x.task || x.data || x.change_request || x : x);
const list = (x) => (Array.isArray(x) ? x : x?.data || []);

const cleanup = [];
try {
  // --- transport/auth
  const raw = (h, body) => fetch(`${API}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...h }, body: JSON.stringify(body) });
  const ping = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  check("no key -> 401", (await raw({}, ping)).status === 401);
  check("bad key -> 401", (await raw({ Authorization: "Bearer opm_nope" }, ping)).status === 401);
  check("GET not allowed -> 405", (await fetch(`${API}/mcp`, { headers: { Authorization: "Bearer x" } })).status === 405);
  check("/mcp/health ok", (await fetch(`${API}/mcp/health`)).status === 200);

  const sarah = await mkKey("sarah.chen@acme.demo", "e2e-owner", ["read", "write"]); cleanup.push(sarah);
  const priya = await mkKey("priya.patel@acme.demo", "e2e-member", ["read", "write"]); cleanup.push(priya);
  const ro = await mkKey("priya.patel@acme.demo", "e2e-readonly", ["read"]); cleanup.push(ro);
  const viaHeader = await raw({ "X-API-Key": sarah.raw }, ping);
  check("X-API-Key header also accepted", viaHeader.status === 200);

  const S = await connect(sarah.raw), P = await connect(priya.raw), R = await connect(ro.raw);
  const tools = (await S.listTools()).tools.map((t) => t.name);
  check(`lists ${tools.length} tools (no org id needed)`, tools.length >= 28);

  // --- owner workflow
  const projects = list((await call(S, "list_projects")).js);
  check("owner sees all 4 projects", projects.length === 4);
  const epic = un((await call(S, "create_task", { project_id: PHX, title: "[E2E] epic", priority: "high" })).js);
  const sub = un((await call(S, "create_task", { project_id: PHX, title: "[E2E] sub", parent_task_id: epic.id })).js);
  check("create task + subtask", !!epic.id && !!sub.id);
  check("update subtask", !(await call(S, "update_task", { project_id: PHX, task_id: sub.id, status: "in_progress" })).err);
  check("tree has subtask", (await call(S, "get_task_tree", { project_id: PHX, task_id: epic.id })).text.includes(sub.id));
  check("comment", !(await call(S, "add_comment", { project_id: PHX, task_id: sub.id, body: "hello from hosted MCP" })).err);
  const st = JSON.stringify((await call(S, "dashboard_stats")).js);
  check("dashboard_stats", st.includes("total_tasks"));
  const an = await call(S, "create_announcement", { title: "[E2E] hi", body: "x" });
  check("announcement create+delete", !an.err && !(await call(S, "delete_announcement", { announcement_id: un(an.js).id })).err);

  // --- member scoped to role
  check("member creates task in own project", !(await call(P, "create_task", { project_id: PHX, title: "[E2E] member task" })).err);
  check("member blocked in other project", (await call(P, "create_task", { project_id: AUR, title: "[E2E] nope" })).err);
  check("member cannot announce", (await call(P, "create_announcement", { title: "x", body: "y" })).err);
  // change request: member proposes, member cannot approve, owner approves
  const cr = un((await call(P, "propose_change", { project_id: PHX, task_id: epic.id, changes: { priority: "critical", due_date: "2026-12-24" }, reason: "e2e" })).js);
  check("member proposes change request", !!cr?.id);
  check("member cannot approve own request", (await call(P, "approve_change_request", { project_id: PHX, change_request_id: cr.id })).err);
  check("owner approves", !(await call(S, "approve_change_request", { project_id: PHX, change_request_id: cr.id, note: "ok" })).err);
  const after = un((await call(S, "get_task", { project_id: PHX, task_id: epic.id })).js);
  check("approved change applied (priority+date)", after.priority === "critical" && (after.due_date || "").startsWith("2026-12-24"), JSON.stringify(after).slice(0, 200));
  check("invalid change rejected up front", (await call(P, "propose_change", { project_id: PHX, task_id: epic.id, changes: { due_date: "garbage" } })).err);

  // --- read-only key
  check("read-only key can read", !(await call(R, "list_projects")).err);
  check("read-only key cannot write", (await call(R, "create_task", { project_id: PHX, title: "[E2E] ro" })).err);

  // --- isolation: two concurrent users never see each other's identity
  const [a, b] = await Promise.all([call(P, "my_tasks"), call(S, "my_tasks")]);
  check("concurrent users handled independently", !a.err && !b.err && a.text !== b.text);

  await call(S, "delete_task", { project_id: PHX, task_id: epic.id });

  // --- revoke
  const adminTok = sarah.tok;
  const del = await fetch(`${API}/api/v1/orgs/${ORG}/api-keys/all/${priya.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${adminTok}` } });
  check("admin revokes member key", del.status === 204);
  const afterRevoke = await call(P, "list_projects");
  check("revoked key stops working immediately", afterRevoke.err, afterRevoke.text);
  for (const c of [S, P, R]) await c.close().catch(() => {});
} finally {
  for (const k of cleanup) await fetch(`${API}/api/v1/orgs/${ORG}/api-keys/${k.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${k.tok}` } }).catch(() => {});
}
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
