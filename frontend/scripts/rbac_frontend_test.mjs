// Drives the REAL running frontend (http://localhost:3000) as 3 contrasting
// role identities set up by rbac_frontend_test.py, and reports what's
// actually rendered — full-page screenshot + every visible button's text —
// so we can compare what a "lead" sees vs an "observer" vs a custom role
// with create-only, no-read permissions.
//
// This injects auth state directly into localStorage using the exact keys
// frontend/src/lib/auth.ts reads (access_token, refresh_token,
// token_expires_at, auth_user) via the same password-grant login path the
// backend explicitly supports (see the comment in auth.ts referencing the
// "demo/native-password path"). It does not fake or bypass any permission
// check — every button shown/hidden below is the real app evaluating the
// real user's real permissions against the real backend.
//
// Run: node scripts/rbac_frontend_test.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const FRONTEND = "http://localhost:3000";
const data = JSON.parse(readFileSync("/tmp/rbac_frontend_sessions.json", "utf8"));
const outDir = "/tmp/rbac_frontend_screens";
mkdirSync(outDir, { recursive: true });

for (const s of data.sessions) {
  // Fresh browser PROCESS per identity, not just a fresh context — isolating
  // whether cross-identity flakiness is context-level (should already be
  // isolated) or something bleeding at the browser-process level.
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Must be on the app's origin before localStorage calls apply.
  await page.goto(FRONTEND, { waitUntil: "domcontentloaded" });

  await page.evaluate((s) => {
    const expiresAt = Date.now() / 1000 + (s.expires_in || 3600);
    localStorage.setItem("access_token", s.access_token);
    localStorage.setItem("refresh_token", s.refresh_token || "");
    localStorage.setItem("token_expires_at", String(expiresAt));
    localStorage.setItem("auth_user", JSON.stringify(s.user));
  }, s);

  const url = `${FRONTEND}/${data.org_slug}/projects/${data.project_id}`;
  console.log(`\n=== ${s.label} (project_role=${s.project_role}) ===`);
  console.log(`GET ${url}`);

  let navError = null;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
  } catch (e) {
    navError = e.message;
  }
  await page.waitForTimeout(1500); // let React Query settle

  const screenshotPath = `${outDir}/${s.label}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Screenshot: ${screenshotPath}`);

  const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 300);
  const buttons = await page.locator("button:visible").allTextContents();
  const cleanButtons = [...new Set(buttons.map((b) => b.trim()).filter(Boolean))].sort();

  console.log(`Nav error: ${navError ?? "none"}`);
  console.log(`Visible button labels (${cleanButtons.length}):`);
  for (const b of cleanButtons) console.log(`  - ${b}`);
  if (cleanButtons.length === 0) {
    console.log(`Body text sample: ${JSON.stringify(bodyText)}`);
  }

  await context.close();
  await browser.close();
}

console.log("\nDone. Screenshots in", outDir);
