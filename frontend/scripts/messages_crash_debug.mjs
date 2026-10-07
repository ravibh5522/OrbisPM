import { chromium } from "playwright";
import { readFileSync } from "fs";

const FRONTEND = "http://localhost:3000";
const s = JSON.parse(readFileSync("/tmp/msg_test_session.json", "utf8"));

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

page.on("console", (msg) => console.log(`[console:${msg.type()}]`, msg.text()));
page.on("pageerror", (err) => console.log(`[PAGEERROR]`, err.message, "\n", err.stack));
page.on("response", (res) => {
  if (res.url().includes("localhost:8000") && !res.ok()) {
    console.log(`[bad response] ${res.status()} ${res.url()}`);
  }
});

await page.goto(FRONTEND, { waitUntil: "domcontentloaded" });
await page.evaluate((s) => {
  const expiresAt = Date.now() / 1000 + (s.expires_in || 3600);
  localStorage.setItem("access_token", s.access_token);
  localStorage.setItem("refresh_token", s.refresh_token || "");
  localStorage.setItem("token_expires_at", String(expiresAt));
  localStorage.setItem("auth_user", JSON.stringify(s.user));
}, s);

const dashUrl = `${FRONTEND}/${s.org_slug}`;
console.log(`Navigating to dashboard first: ${dashUrl}`);
await page.goto(dashUrl, { waitUntil: "networkidle", timeout: 20000 }).catch((e) => console.log("goto error:", e.message));
await page.waitForTimeout(1500);

console.log("Clicking the Messages sidebar link...");
await page.getByRole("link", { name: /messages/i }).first().click().catch((e) => console.log("click error:", e.message));
await page.waitForTimeout(3000);

console.log("\nFinal URL:", page.url());
await page.screenshot({ path: "/tmp/messages_crash.png", fullPage: true });
console.log("Screenshot: /tmp/messages_crash.png");

const bodyText = await page.locator("body").innerText().catch(() => "(failed to read body)");
console.log("\nBody text:\n", bodyText.slice(0, 1000));

await browser.close();
