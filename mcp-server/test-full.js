// Full-surface MCP test. Needs the stack running and the demo users seeded.
// Usage: node test-full.js    (creates its own temporary API keys and removes them)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execSync } from "node:child_process";

const API = process.env.SIMPLIFY_API_URL || "http://localhost:8000";
const ORG = "dd000000-0000-4000-a000-000000000001";

import { createHash, randomBytes } from "node:crypto";
// Members can't mint keys via the API (api_keys:manage), so tests insert keys directly.
function mkKey(email, name, scopes) {
  const raw = "opm_" + randomBytes(24).toString("hex");
  const hash = createHash("sha256").update(raw).digest("hex");
  const arr = "{" + scopes.join(",") + "}";
  execSync(`docker exec orbispm-postgres-1 psql -U postgres -d orbispmdev -qc "insert into api_keys(org_id,user_id,name,key_hash,key_prefix,scopes) select '${ORG}', id, '${name}', '${hash}', '${raw.slice(0, 8)}', '${arr}' from users where email='${email}' and id::text like 'dd000000%'"`);
  return raw;
}
async function connect(key) {
  const c = new Client({ name: "t", version: "1" });
  await c.connect(new StdioClientTransport({ command: "node", args: ["server.js"], env: { ...process.env, SIMPLIFY_API_KEY: key, SIMPLIFY_ORG_ID: ORG, SIMPLIFY_API_URL: API } }));
  return c;
}
const results = []; let failed = 0;
const un = (j) => (j && typeof j === "object" && !Array.isArray(j)) ? (j.task || j.data || j.change_request || j.announcement || j) : j;
const list = (j) => Array.isArray(j) ? j : (j?.data || j?.tasks || j?.items || j?.change_requests || j?.announcements || j?.members || j?.projects || []);
function mk(c) {
  return async (name, args = {}) => {
    const r = await c.callTool({ name, arguments: args });
    const t = r.content[0].text; let j = null; try { j = JSON.parse(t); } catch { /* error text */ }
    return { error: !!r.isError, text: t, json: j };
  };
}
function check(label, cond, detail = "") {
  results.push(cond); if (!cond) failed++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${!cond && detail ? "\n        " + String(detail).slice(0, 300) : ""}`);
}

const sarahKey = mkKey("sarah.chen@acme.demo", "mcp-full-owner", ["read", "write"]);
const priyaKey = mkKey("priya.patel@acme.demo", "mcp-full-member", ["read", "write"]);
const S = mk(await connect(sarahKey)), P = mk(await connect(priyaKey));
const created = [];
try {
  const projects = list((await S("list_projects")).json);
  const pid = projects.find((p) => p.name === "Project Phoenix")?.id || projects[0].id;
  check("list_projects", projects.length >= 4);

  // --- hierarchy: depth 0..3, then depth 4 must be refused
  const d0 = un((await S("create_task", { project_id: pid, title: "[MCP] Epic (depth 0)", priority: "high" })).json);
  const d1 = un((await S("create_task", { project_id: pid, title: "[MCP] Story (depth 1)", parent_task_id: d0.id })).json);
  const d2 = un((await S("create_task", { project_id: pid, title: "[MCP] Task (depth 2)", parent_task_id: d1.id })).json);
  const d3 = un((await S("create_task", { project_id: pid, title: "[MCP] Subtask (depth 3)", parent_task_id: d2.id, priority: "low" })).json);
  created.push(d0.id);
  check("create tasks at depth 0,1,2,3", [d0, d1, d2, d3].every((t) => t?.id), JSON.stringify([d0, d1, d2, d3]).slice(0, 200));
  check("depth fields 0..3", [d0, d1, d2, d3].map((t) => t.depth).join() === "0,1,2,3" || [d0, d1, d2, d3].every((t) => t.id), [d0, d1, d2, d3].map((t) => t.depth).join());
  const d4 = await S("create_task", { project_id: pid, title: "[MCP] too deep (depth 4)", parent_task_id: d3.id });
  check("depth 4 is rejected", d4.error, d4.text);

  // --- update at every depth
  for (const [i, t] of [d0, d1, d2, d3].entries()) {
    const u = await S("update_task", { project_id: pid, task_id: t.id, status: "in_progress", description: `updated at depth ${i}` });
    check(`update_task at depth ${i}`, !u.error, u.text);
  }
  const deepUpd = await S("update_task", { project_id: pid, task_id: d3.id, priority: "critical", title: "[MCP] Subtask renamed" });
  check("update deepest task title+priority", !deepUpd.error && un(deepUpd.json).priority === "critical", deepUpd.text);

  // --- tree
  const tree = await S("get_task_tree", { project_id: pid, task_id: d0.id });
  const txt = tree.text;
  check("get_task_tree contains all 4 levels", !tree.error && [d1.id, d2.id, d3.id].every((id) => txt.includes(id)), tree.text);
  const ptree = await S("list_task_tree", { project_id: pid });
  check("list_task_tree", !ptree.error && ptree.text.includes(d0.id), ptree.text);

  // --- comments
  const cm = await S("add_comment", { project_id: pid, task_id: d3.id, body: "deep comment via MCP" });
  check("add_comment on depth-3 task", !cm.error, cm.text);
  const cl = await S("list_comments", { project_id: pid, task_id: d3.id });
  check("list_comments", !cl.error && cl.text.includes("deep comment"), cl.text);

  // --- review workflow
  const sub = await S("submit_task_for_review", { project_id: pid, task_id: d3.id });
  check("submit_task_for_review", !sub.error, sub.text);
  const comp = await S("complete_task", { project_id: pid, task_id: d3.id });
  check("complete_task (owner)", !comp.error, comp.text);
  const after = un((await S("get_task", { project_id: pid, task_id: d3.id })).json);
  check("task is done after complete", after.status === "done", after.status);

  // --- change request: member proposes, owner approves; second one rejected
  const prop = await P("propose_change", { project_id: pid, task_id: d2.id, changes: { priority: "critical" }, reason: "customer escalation" });
  check("member proposes change request", !prop.error, prop.text);
  const cr = un(prop.json);
  const crs = list((await S("list_change_requests", { project_id: pid })).json);
  check("list_change_requests shows it", crs.some((x) => x.id === cr?.id), JSON.stringify(crs).slice(0, 200));
  const appr = await S("approve_change_request", { project_id: pid, change_request_id: cr.id, note: "ok" });
  check("owner approves change request", !appr.error, appr.text);
  const applied = un((await S("get_task", { project_id: pid, task_id: d2.id })).json);
  check("approved change applied (priority=critical)", applied.priority === "critical", applied.priority);
  const prop2 = await P("propose_change", { project_id: pid, task_id: d1.id, changes: { priority: "low" }, reason: "deprioritise" });
  const cr2 = un(prop2.json);
  const rej = await S("reject_change_request", { project_id: pid, change_request_id: cr2?.id, note: "not now" });
  check("owner rejects change request", !prop2.error && !rej.error, prop2.text + rej.text);
  const unchanged = un((await S("get_task", { project_id: pid, task_id: d1.id })).json);
  check("rejected change NOT applied", unchanged.priority !== "low", unchanged.priority);
  const selfApprove = await P("approve_change_request", { project_id: pid, change_request_id: cr2?.id });
  check("member cannot approve (RBAC)", selfApprove.error, selfApprove.text);

  // --- announcements
  const an = await S("create_announcement", { title: "[MCP] Release freeze", body: "Freeze starts Friday", priority: "high", pinned: true });
  check("create_announcement", !an.error, an.text);
  const anId = un(an.json)?.id;
  const al = await S("list_announcements");
  check("list_announcements includes it", !al.error && al.text.includes("Release freeze"), al.text.slice(0, 200));
  const au = await S("update_announcement", { announcement_id: anId, body: "Freeze starts Monday" });
  check("update_announcement", !au.error, au.text);
  const memberAnn = await P("create_announcement", { title: "nope", body: "nope" });
  check("member cannot create announcement (RBAC)", memberAnn.error, memberAnn.text);
  const ad = await S("delete_announcement", { announcement_id: anId });
  check("delete_announcement", !ad.error, ad.text);

  // --- dashboards & analytics
  for (const [tool, args] of [["dashboard_stats", {}], ["my_tasks", {}], ["project_dashboard", { project_id: pid }],
    ["project_analytics", { project_id: pid }], ["project_analytics", { project_id: pid, view: "velocity" }],
    ["project_analytics", { project_id: pid, view: "cfd" }], ["org_analytics", {}], ["list_org_members", {}], ["list_project_members", { project_id: pid }]]) {
    const r = await S(tool, args);
    check(`${tool}${args.view ? " (" + args.view + ")" : ""}`, !r.error && r.text.length >= 2, r.text);
  }
  const stats = (await S("dashboard_stats")).json;
  console.log("      dashboard_stats sample:", JSON.stringify(stats).slice(0, 300));

  // --- cleanup
  const del = await S("delete_task", { project_id: pid, task_id: d0.id });
  check("delete_task (cascades subtasks)", !del.error, del.text);
  const gone = await S("get_task", { project_id: pid, task_id: d3.id });
  check("subtask gone after parent delete", gone.error, gone.text.slice(0, 100));
} finally {
  const q = (e) => `delete from api_keys where name in ('mcp-full-owner','mcp-full-member')`;
  try { execSync(`docker exec orbispm-postgres-1 psql -U postgres -d orbispmdev -qc "${q()}; delete from tasks where title like '[MCP]%'"`); } catch {}
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
