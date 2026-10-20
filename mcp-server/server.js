#!/usr/bin/env node
// Simplify Projects MCP server — local (stdio) mode.
// Env: SIMPLIFY_API_KEY (required), SIMPLIFY_ORG_ID (optional, auto-detected), SIMPLIFY_API_URL.
// For the hosted mode see http.js (served at /mcp).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { makeApi, keyInfo } from "./api.js";
import { registerTools } from "./tools.js";

const BASE = (process.env.SIMPLIFY_API_URL || "http://localhost:8000").replace(/\/$/, "");
const KEY = process.env.SIMPLIFY_API_KEY;
if (!KEY) { console.error("SIMPLIFY_API_KEY is required"); process.exit(1); }
let ORG = process.env.SIMPLIFY_ORG_ID;
if (!ORG) {
  const info = await keyInfo(BASE, KEY);
  if (!info) { console.error("Invalid API key (could not detect org)"); process.exit(1); }
  ORG = info.org_id;
}

const server = new McpServer({ name: "simplify-projects", version: "2.0.0" });
registerTools(server, makeApi({ base: BASE, key: KEY, org: ORG }));
await server.connect(new StdioServerTransport());
