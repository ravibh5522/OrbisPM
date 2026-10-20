// End-to-end test: spawns the MCP server over stdio and drives it with a real MCP client.
// Usage: SIMPLIFY_API_KEY=opm_... SIMPLIFY_ORG_ID=... node test.js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";

const transport = new StdioClientTransport({ command: "node", args: ["server.js"], env: process.env });
const client = new Client({ name: "test", version: "1.0.0" });
await client.connect(transport);

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content[0].text;
  return { error: !!r.isError, text, json: r.isError ? null : JSON.parse(text) };
};
const rows = (j) => Array.isArray(j) ? j : (j.data || j.projects || j.tasks || j.items || j.comments || []);
let n = 0; const pass = (m) => console.log(`ok ${++n} - ${m}`);

const tools = (await client.listTools()).tools.map((t) => t.name);
assert.ok(["list_projects", "create_task", "update_task", "add_comment"].every((t) => tools.includes(t)));
pass(`lists ${tools.length} tools`);

const projects = rows((await call("list_projects")).json);
assert.ok(projects.length > 0); pass(`list_projects -> ${projects.length} project(s)`);
const pid = projects[0].id;

const created = (await call("create_task", { project_id: pid, title: "MCP smoke test task", priority: "high", description: "Created by an AI agent over MCP" })).json;
const task = created.task || created.data || created; assert.ok(task.id); pass(`create_task -> ${task.id}`);

const upd = await call("update_task", { project_id: pid, task_id: task.id, status: "in_progress" });
assert.ok(!upd.error, upd.text); pass("update_task status=in_progress");

const got = (await call("get_task", { project_id: pid, task_id: task.id })).json;
assert.equal((got.task || got.data || got).status, "in_progress"); pass("get_task reflects update");

const cm = await call("add_comment", { project_id: pid, task_id: task.id, body: "Agent comment via MCP" });
assert.ok(!cm.error, cm.text); pass("add_comment");

const tasks = rows((await call("list_tasks", { project_id: pid })).json);
assert.ok(tasks.some((t) => t.id === task.id)); pass("list_tasks includes new task");

await call("update_task", { project_id: pid, task_id: task.id, status: "done" });
console.log(`\nall ${n} checks passed`);
await client.close();
