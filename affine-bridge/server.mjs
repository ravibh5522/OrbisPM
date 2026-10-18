// affine-bridge: creates AFFiNE docs on behalf of the OrbisPM API.
//
// AFFiNE's GraphQL API has no createDoc mutation: a workspace's root doc and
// every page doc are Yjs CRDTs that only its sync gateway (socket.io) accepts.
// A workspace that was created over GraphQL alone has no root doc, so the web
// client sits on "Syncing..." forever and an unknown doc ID renders "content
// does not exist". This service speaks the same sync protocol the AFFiNE web
// client uses (space:join / space:load-doc / space:push-doc-update) to
// initialise the root doc and register + seed a page doc.
//
// Doc shapes were taken from docs the real 0.27 web client wrote:
//   root doc: meta{pages[{id,title,createDate,tags}], name}, spaces{docId -> subdoc}
//   page doc: blocks{ affine:page > [affine:surface, affine:note > affine:paragraph] }
import http from "node:http";
import { randomBytes } from "node:crypto";
import { io } from "socket.io-client";
import * as Y from "yjs";

const AFFINE_URL = process.env.AFFINE_INTERNAL_URL || "http://affine:3010";
const ADMIN_EMAIL = process.env.AFFINE_ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.AFFINE_ADMIN_PASSWORD || "";
const PORT = Number(process.env.PORT || 8085);
// Gateway rejects clients older than 0.25; 0.26+ selects the batched protocol.
const CLIENT_VERSION = "0.27.0";
const SPACE = "workspace";

let sessionCookie = "";

async function signIn() {
  const res = await fetch(`${AFFINE_URL}/api/auth/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`affine sign-in failed: ${res.status}`);
  sessionCookie = res
    .headers.getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => c.startsWith("affine_session=") || c.startsWith("affine_user_id="))
    .join("; ");
  if (!sessionCookie.includes("affine_session=")) throw new Error("affine sign-in returned no session");
}

function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(15000).emit(event, payload, (err, res) => {
      if (err) return reject(new Error(`${event}: ${err.message}`));
      if (res?.error) return reject(Object.assign(new Error(`${event}: ${res.error.message}`), { code: res.error.name }));
      resolve(res.data);
    });
  });
}

function connect() {
  return new Promise((resolve, reject) => {
    const socket = io(AFFINE_URL, {
      transports: ["websocket"],
      extraHeaders: { Cookie: sessionCookie },
      reconnection: false,
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (e) => reject(e));
  });
}

// One socket per request keeps state trivially correct; provisioning happens
// once per org/project, so connection cost is irrelevant.
async function withSpace(workspaceId, fn) {
  if (!sessionCookie) await signIn();
  let socket;
  try {
    socket = await connect();
  } catch {
    await signIn(); // session expired
    socket = await connect();
  }
  try {
    const joined = await emit(socket, "space:join", { spaceType: SPACE, spaceId: workspaceId, clientVersion: CLIENT_VERSION });
    if (!joined.success) throw new Error("space:join rejected");
    return await fn(socket);
  } finally {
    socket.disconnect();
  }
}

const b64 = (u8) => Buffer.from(u8).toString("base64");

// Loads a doc into a fresh Y.Doc. Returns null when the server has no such doc.
async function loadDoc(socket, workspaceId, docId) {
  try {
    const { missing, state } = await emit(socket, "space:load-doc", { spaceType: SPACE, spaceId: workspaceId, docId });
    const doc = new Y.Doc({ guid: docId });
    Y.applyUpdate(doc, Buffer.from(missing, "base64"));
    return { doc, stateVector: Buffer.from(state, "base64") };
  } catch (e) {
    if (e.code === "DOC_NOT_FOUND") return null;
    throw e;
  }
}

function pushUpdate(socket, workspaceId, docId, update) {
  return emit(socket, "space:push-doc-update", { spaceType: SPACE, spaceId: workspaceId, docId, update: b64(update) });
}

const blockId = () => randomBytes(8).toString("base64url").slice(0, 10);

function block(blocks, flavour, version, children, props) {
  const id = blockId();
  const b = new Y.Map();
  b.set("sys:id", id);
  b.set("sys:flavour", flavour);
  b.set("sys:version", version);
  b.set("sys:children", Y.Array.from(children));
  for (const [k, v] of Object.entries(props)) b.set(`prop:${k}`, v);
  blocks.set(id, b);
  return id;
}

// A blank page: title, an empty surface (edgeless canvas) and one note holding
// an empty paragraph — what AFFiNE's own "New doc" creates.
function seedPage(title) {
  const doc = new Y.Doc();
  const blocks = doc.getMap("blocks");
  doc.transact(() => {
    const paragraph = block(blocks, "affine:paragraph", 1, [], { type: "text", text: new Y.Text(""), collapsed: false });
    const note = block(blocks, "affine:note", 1, [paragraph], {
      xywh: "[0,0,800,95]",
      background: new Y.Map(Object.entries({ light: "#ffffff", dark: "#252525" })),
      index: "a0",
      lockedBySelf: false,
      hidden: false,
      displayMode: "both",
      edgeless: new Y.Map([["style", new Y.Map(Object.entries({ borderRadius: 8, borderSize: 4, borderStyle: "none", shadowType: "--affine-note-shadow-box" }))]]),
    });
    const surface = block(blocks, "affine:surface", 5, [], {
      elements: new Y.Map(Object.entries({ type: "$blocksuite:internal:native$", value: new Y.Map() })),
    });
    block(blocks, "affine:page", 2, [surface, note], { title: new Y.Text(title) });
  });
  return doc;
}

// Two members opening a new project at once would both see "page missing"
// and register it twice (CRDT merges keep both array entries), so requests
// for the same workspace run one at a time.
const tails = new Map();
function serialize(key, fn) {
  const run = (tails.get(key) ?? Promise.resolve()).catch(() => {}).then(fn);
  tails.set(key, run);
  run.finally(() => {
    if (tails.get(key) === run) tails.delete(key);
  }).catch(() => {});
  return run;
}

// Idempotent: safe to call on every Canvas open.
async function ensureDoc({ workspaceId, docId, title, workspaceName }) {
  return withSpace(workspaceId, async (socket) => {
    const loaded = await loadDoc(socket, workspaceId, workspaceId);
    const root = loaded?.doc ?? new Y.Doc({ guid: workspaceId });
    const meta = root.getMap("meta");
    const spaces = root.getMap("spaces");

    let registered = false;
    root.transact(() => {
      if (!meta.has("pages")) meta.set("pages", new Y.Array());
      if (!meta.has("name")) meta.set("name", workspaceName);
      const pages = meta.get("pages");
      if (pages.toArray().some((p) => p.get("id") === docId)) return;
      pages.push([new Y.Map([["id", docId], ["title", title], ["createDate", Date.now()], ["tags", new Y.Array()]])]);
      spaces.set(docId, new Y.Doc({ guid: docId }));
      registered = true;
    });

    // Page doc first: if registering the root succeeds but the page doc is
    // missing the doc would open as "does not exist" with no way to self-heal.
    const page = await loadDoc(socket, workspaceId, docId);
    if (!page) await pushUpdate(socket, workspaceId, docId, Y.encodeStateAsUpdate(seedPage(title)));

    if (registered || !loaded) {
      await pushUpdate(socket, workspaceId, workspaceId, Y.encodeStateAsUpdate(root, loaded?.stateVector));
    }
    return { rootInitialised: !loaded, docRegistered: registered, docSeeded: !page };
  });
}

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 64 * 1024) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
  });
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

const server = http.createServer(async (req, res) => {
  const reply = (status, obj) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (req.method === "GET" && req.url === "/health") return reply(200, { ok: true });
  if (req.method !== "POST" || req.url !== "/docs") return reply(404, { error: "not found" });
  try {
    const { workspaceId, docId, title, workspaceName } = await readJSON(req);
    if (!ID.test(workspaceId ?? "") || !ID.test(docId ?? "")) return reply(400, { error: "invalid workspaceId or docId" });
    const result = await serialize(workspaceId, () =>
      ensureDoc({ workspaceId, docId, title: String(title ?? "Untitled"), workspaceName: String(workspaceName ?? "Workspace") }),
    );
    reply(200, result);
  } catch (e) {
    console.error("ensureDoc failed:", e.message);
    reply(502, { error: e.message });
  }
});

server.listen(PORT, () => console.log(`affine-bridge listening on :${PORT}`));
