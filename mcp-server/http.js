#!/usr/bin/env node
// Simplify Projects MCP server — hosted (Streamable HTTP) mode, served at /mcp.
// Stateless: every request carries its own API key, so one process serves many users.
//   Authorization: Bearer opm_...   (or  X-API-Key: opm_...)
// Env: SIMPLIFY_API_URL (backend base, default http://api:8080), PORT (default 8090).
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { makeApi, keyInfo } from "./api.js";
import { registerTools } from "./tools.js";

const BASE = (process.env.SIMPLIFY_API_URL || "http://api:8080").replace(/\/$/, "");
const PORT = Number(process.env.PORT || 8090);
const MAX_BODY = 1_000_000;

function extractKey(req) {
  const x = req.headers["x-api-key"];
  if (x) return String(x).trim();
  const a = req.headers["authorization"];
  const m = a && /^Bearer\s+(.+)$/i.exec(a);
  return m ? m[1].trim() : "";
}
const send = (res, status, obj, extra = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...extra });
  res.end(JSON.stringify(obj));
};
const rpcError = (res, status, code, message) =>
  send(res, status, { jsonrpc: "2.0", error: { code, message }, id: null },
    status === 401 ? { "WWW-Authenticate": 'Bearer realm="simplify-projects-mcp"' } : {});

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error("body too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

// small cache so we don't hit /key-info on every JSON-RPC message
const infoCache = new Map();
async function resolveKey(key) {
  const hit = infoCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.info;
  const info = await keyInfo(BASE, key);
  if (info) infoCache.set(key, { info, exp: Date.now() + 30_000 });
  else infoCache.delete(key);
  return info;
}

const server = http.createServer(async (req, res) => {
  const path = (req.url || "").split("?")[0].replace(/\/+$/, "");
  if (path === "/health" || path === "/mcp/health") return send(res, 200, { status: "ok" });
  if (path !== "/mcp") return send(res, 404, { message: "not found" });

  if (req.method !== "POST")
    return rpcError(res, 405, -32000, "Method not allowed. Use POST (stateless Streamable HTTP).");

  const key = extractKey(req);
  if (!key) return rpcError(res, 401, -32001, "Missing API key. Send 'Authorization: Bearer opm_...'.");
  const info = await resolveKey(key).catch(() => null);
  if (!info) return rpcError(res, 401, -32001, "Invalid or expired API key.");

  let body;
  try { body = await readBody(req); } catch { return rpcError(res, 400, -32700, "Invalid JSON body."); }

  const mcp = new McpServer({ name: "simplify-projects", version: "2.0.0" });
  registerTools(mcp, makeApi({ base: BASE, key, org: info.org_id }));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // stateless
  res.on("close", () => { transport.close(); mcp.close(); });
  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    if (!res.headersSent) rpcError(res, 500, -32603, "Internal server error");
  }
});

server.listen(PORT, () => console.log(`simplify-projects MCP (http) listening on :${PORT}/mcp -> ${BASE}`));
