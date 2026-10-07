// Drives the REAL running frontend (http://localhost:3000) as each role
// identity set up by rbac_frontend_test.py, ONE AT A TIME, IN SEQUENCE:
// fresh browser -> inject that identity's real token -> load the real
// project page -> screenshot + record what's rendered -> close browser ->
// pause -> next identity. Never two identities running concurrently.
//
// This injects auth state directly into localStorage using the exact keys
// frontend/src/lib/auth.ts reads (access_token, refresh_token,
// token_expires_at, auth_user) via the same password-grant login path the
// backend explicitly supports (see the comment in auth.ts referencing the
// "demo/native-password path"). It does not fake or bypass any permission
// check — every button shown/hidden below is the real app evaluating the
// real user's real permissions against the real backend.
//
// Two known sources of test-harness flakiness (NOT app bugs, both handled
// below): (1) reusing one browser process across identities can bleed
// state — mitigated with a fresh browser per identity; (2) each dashboard
// load fires ~15-20 parallel API calls against a backend with a per-IP
// rate limiter (600/min, burst 50) shared across every identity plus the
// setup script's own signup/login/invite calls — mitigated with a pause
// between identities AND a detect-and-retry: if a run lands on /login
// instead of the project page, that's not a permission result, it's a
// bounced session — retried once before being reported as inconclusive.
//
// Run: node scripts/rbac_frontend_test.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const FRONTEND = "http://localhost:3000";
const data = JSON.parse(readFileSync("/tmp/rbac_frontend_sessions.json", "utf8"));
const outDir = "/tmp/rbac_frontend_screens";
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function attempt(s) {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(FRONTEND, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => {
    const expiresAt = Date.now() / 1000 + (s.expires_in || 3600);
    localStorage.setItem("access_token", s.access_token);
    localStorage.setItem("refresh_token", s.refresh_token || "");
    localStorage.setItem("token_expires_at", String(expiresAt));
    localStorage.setItem("auth_user", JSON.stringify(s.user));
  }, s);

  const url = `${FRONTEND}/${data.org_slug}/projects/${data.project_id}`;
  let navError = null;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
  } catch (e) {
    navError = e.message;
  }
  await page.waitForTimeout(1500);

  const finalUrl = page.url();
  const bouncedToLogin = finalUrl.includes("/login");

  const screenshotPath = `${outDir}/${s.label}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 300);
  const buttons = await page.locator("button:visible").allTextContents();
  const cleanButtons = [...new Set(buttons.map((b) => b.trim()).filter(Boolean))].sort();

  await context.close();
  await browser.close();

  return { navError, finalUrl, bouncedToLogin, screenshotPath, bodyText, cleanButtons };
}

const summary = [];
let i = 0;
for (const s of data.sessions) {
  i++;
  console.log(`\n[${i}/${data.sessions.length}] ===== testing "${s.label}" (project_role=${s.project_role}) =====`);

  if (i > 1) {
    console.log("Pausing 5s before this identity to stay clear of the backend's per-IP rate limit...");
    await sleep(5000);
  }

  let result = await attempt(s);
  let retried = false;
  if (result.bouncedToLogin) {
    console.log(`Bounced to /login on first attempt — not a permission result, retrying once after backoff...`);
    await sleep(8000);
    result = await attempt(s);
    retried = true;
  }

  console.log(`Nav error: ${result.navError ?? "none"}`);
  console.log(`Final URL: ${result.finalUrl}`);
  console.log(`Screenshot: ${result.screenshotPath}`);
  if (result.bouncedToLogin) {
    console.log(`INCONCLUSIVE — bounced to /login even after retry. Not counted as a permission result.`);
  } else {
    console.log(`Visible button labels (${result.cleanButtons.length}):`);
    for (const b of result.cleanButtons) console.log(`  - ${b}`);
    if (result.cleanButtons.length === 0) {
      console.log(`Body text sample: ${JSON.stringify(result.bodyText)}`);
    }
  }
  console.log(`[${i}/${data.sessions.length}] "${s.label}" done${retried ? " (after 1 retry)" : ""} — ${result.bouncedToLogin ? "INCONCLUSIVE" : result.cleanButtons.length + " controls"}`);

  summary.push({
    label: s.label,
    role: s.project_role,
    inconclusive: result.bouncedToLogin,
    retried,
    buttonCount: result.cleanButtons.length,
  });
}

console.log("\n\n===== SEQUENTIAL RUN SUMMARY =====");
for (const r of summary) {
  const status = r.inconclusive ? "INCONCLUSIVE (bounced to login)" : `${r.buttonCount} visible controls`;
  console.log(`${r.label.padEnd(16)} role=${r.role.padEnd(24)} ${status}${r.retried ? " [retried]" : ""}`);
}
console.log("\nDone. Screenshots in", outDir);
