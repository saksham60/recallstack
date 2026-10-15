import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "node:crypto";

nextEnv.loadEnvConfig(process.cwd());
if (process.env.DSA_SMOKE_CREATE_USER !== "1") throw new Error("Opt in with DSA_SMOKE_CREATE_USER=1 to create and delete one temporary test account.");
const origin = new URL(process.env.DSA_SMOKE_URL ?? "http://localhost:3000");
if (!["localhost", "127.0.0.1", "reasonai.tech", "www.reasonai.tech"].includes(origin.hostname) || origin.username || origin.password) throw new Error("Use the known local or production origin.");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `dsa-smoke-${randomUUID()}@example.invalid`, password = randomBytes(32).toString("base64url");
let userId;
try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Could not create the temporary smoke account.");
  userId = created.data.user.id;
  const signed = await auth.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw new Error("Temporary account sign-in failed.");
  const headers = { Authorization: `Bearer ${signed.data.session.access_token}`, "Content-Type": "application/json" };
  const problemId = randomUUID(), problemVersionId = randomUUID(), missing = randomUUID();
  const request = { problemId, problemVersionId, language: "python", mode: "run", code: "def solve(nums): return sum(nums)", idempotencyKey: randomUUID() };
  const capabilities = `/api/dsa/execution-capabilities?problemId=${problemId}&problemVersionId=${problemVersionId}`;
  for (const check of [
    { path: capabilities, expected: 200 },
    { path: capabilities, anonymous: true, expected: 401 },
    { path: "/api/dsa/executions", method: "POST", body: request, expected: 409 },
    { path: "/api/dsa/executions", method: "POST", body: { ...request, code: " " }, expected: 422 },
    { path: `/api/dsa/executions/${missing}`, expected: 404 },
    { path: `/api/dsa/executions/${missing}`, method: "DELETE", expected: 404 },
    { path: "/api/dsa/executions", method: "POST", body: request, crossOrigin: true, expected: 403 },
    { path: "/api/dsa/execution-recovery", method: "POST", body: { probe: true }, anonymous: true, expected: 401 },
  ]) {
    const started = Date.now();
    const response = await fetch(new URL(check.path, origin), { method: check.method ?? "GET", headers: { ...(check.anonymous ? {} : headers), ...(check.crossOrigin ? { Origin: "https://untrusted.invalid" } : {}) }, body: check.body ? JSON.stringify(check.body) : undefined, signal: AbortSignal.timeout(30000), redirect: "error" });
    if (response.status !== check.expected || response.headers.get("x-dsa-execution-version") !== "1") throw new Error(`Unexpected ${response.status} for ${check.method ?? "GET"} ${check.path.split("?")[0]}.`);
    const body = await response.json();
    if (check.expected === 200 && (body.run || body.submit || body.languages.length)) throw new Error("Missing versions must be ineligible.");
    console.log(JSON.stringify({ route: check.path.split("?")[0], method: check.method ?? "GET", status: response.status, durationMs: Date.now() - started }));
  }
  if (process.env.DSA_SMOKE_QUEUE_PROBE === "1") {
    if (!process.env.CRON_SECRET) throw new Error("The delivery probe requires the local cron secret.");
    const response = await fetch(new URL("/api/dsa/execution-recovery", origin), { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, "Content-Type": "application/json" }, body: JSON.stringify({ probe: true }), signal: AbortSignal.timeout(30000), redirect: "error" });
    if (response.status !== 202) throw new Error(`Queue delivery probe failed with ${response.status}.`);
    console.log(JSON.stringify({ queueDeliveryProbe: await response.json() }));
  }
  if (process.env.DSA_SMOKE_BROWSER === "1") {
    const { createServerClient } = await import("@supabase/ssr");
    const { chromium, expect } = await import("@playwright/test");
    const cookies = new Map();
    const session = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [], setAll: (values) => values.forEach((cookie) => cookies.set(cookie.name, cookie.value)) } });
    const restored = await session.auth.setSession(signed.data.session);
    if (restored.error) throw new Error("Could not prepare the real browser session.");
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
      await context.addCookies([...cookies].filter(([, value]) => value).map(([name, value]) => ({ name, value, domain: origin.hostname, path: "/", secure: origin.protocol === "https:", sameSite: "Lax" })));
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.name));
      const catalogPromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/dsa/problems", { timeout: 30000 });
      await page.goto(new URL("/dsa", origin).href);
      const catalog = await catalogPromise;
      if (catalog.status() !== 200) throw new Error(`Hosted browser catalog returned ${catalog.status()}.`);
      const body = await catalog.json();
      if (!body.items.length) await expect(page.getByRole("heading", { name: "No approved problems yet" })).toBeVisible();
      await page.screenshot({ path: ".next/cache/dsa-hosted-desktop.png", fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: ".next/cache/dsa-hosted-mobile.png", fullPage: true });
      if (errors.length) throw new Error(`Hosted workspace had ${errors.length} page errors.`);
      console.log(JSON.stringify({ browser: "verified real Supabase session and canonical catalog", catalogStatus: catalog.status(), items: body.items.length, pageErrors: errors.length }));
    } finally { await browser.close(); }
  }
} finally {
  await auth.auth.signOut({ scope: "local" });
  if (userId) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) throw new Error(`Temporary smoke account cleanup failed: ${userId}`);
    console.log("Temporary smoke account deleted.");
  }
}
