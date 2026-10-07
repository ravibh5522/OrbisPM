import { chromium } from "playwright";
import { readFileSync } from "fs";

const FRONTEND = "http://localhost:3000";
const data = JSON.parse(readFileSync("/tmp/rbac_frontend_sessions.json", "utf8"));
const label = process.argv[2] || "field_tester";
const s = data.sessions.find((x) => x.label === label);

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

page.on("console", (msg) => console.log(`[console:${msg.type()}]`, msg.text()));
page.on("pageerror", (err) => console.log(`[pageerror]`, err.message));
page.on("request", (req) => console.log(`[request] ${req.method()} ${req.url()}`));
page.on("requestfailed", (req) => console.log(`[requestfailed] ${req.url()} — ${req.failure()?.errorText}`));
page.on("response", (res) => console.log(`[response] ${res.status()} ${res.url()}`));
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame()) console.log(`[navigated] ${frame.url()}`);
});

await page.goto(FRONTEND, { waitUntil: "domcontentloaded" });

const setResult = await page.evaluate((s) => {
  const expiresAt = Date.now() / 1000 + (s.expires_in || 3600);
  localStorage.setItem("access_token", s.access_token);
  localStorage.setItem("refresh_token", s.refresh_token || "");
  localStorage.setItem("token_expires_at", String(expiresAt));
  localStorage.setItem("auth_user", JSON.stringify(s.user));
  return {
    access_token_set: !!localStorage.getItem("access_token"),
    auth_user_set: !!localStorage.getItem("auth_user"),
    expires_at: localStorage.getItem("token_expires_at"),
    now: Date.now() / 1000,
  };
}, s);
console.log("localStorage after set:", setResult);

const url = `${FRONTEND}/${data.org_slug}/projects/${data.project_id}`;
console.log(`\nNavigating to ${url}`);
await page.goto(url, { waitUntil: "networkidle", timeout: 20000 }).catch((e) => console.log("goto error:", e.message));
await page.waitForTimeout(2000);

console.log("\nFinal URL:", page.url());
const finalStorage = await page.evaluate(() => ({
  access_token: localStorage.getItem("access_token"),
  auth_user: localStorage.getItem("auth_user"),
}));
console.log("localStorage at end:", finalStorage.access_token ? "access_token PRESENT" : "access_token GONE", finalStorage.auth_user ? "auth_user PRESENT" : "auth_user GONE");

await browser.close();
