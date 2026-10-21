// Read-only HTTP audit. Uses normal judge sign-in; never promotes or impersonates an admin.
// Stores only aggregate/status evidence, never session tokens or user-list payloads.
import { chromium } from '@playwright/test';
import nextEnv from '@next/env';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
nextEnv.loadEnvConfig(process.cwd());
const base = process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, '');
const out = resolve(process.env.LOCALAPPDATA, 'Temp/reasonai-admin-audit');
await mkdir(out, { recursive: true });
const evidence = { at: new Date().toISOString(), apiOrigin: base, productionWrites: 'Normal sign-in only; no admin mutations or paid calls', requests: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
let token;
page.on('request', r => { if (r.url().startsWith(base + '/api/v1/')) token = r.headers().authorization ?? token; });
async function probe(path, authorized = false) {
  const start = performance.now();
  const r = await context.request.get(base + path, { headers: { Origin: 'https://www.reasonai.tech', ...(authorized && token ? { Authorization: token } : {}) } });
  const b = await r.json().catch(() => null);
  const row = { path, session: authorized ? 'normal judge' : 'none', status: r.status(), elapsedMs: Math.round(performance.now() - start), allowOrigin: r.headers()['access-control-allow-origin'] ?? null };
  if (r.status() === 422 && path.includes('/growth')) row.validationBody = b;
  evidence.requests.push(row);
  return b;
}
try {
  const schema = await probe('/openapi.json');
  evidence.deployedGrowthContract = schema?.paths?.['/api/v1/admin/growth']?.get?.parameters;
  evidence.deployedGrowthDaysSchema = schema?.components?.schemas?.GrowthDays;
  await probe('/api/v1/admin/growth?days=30');
  await page.goto('https://www.reasonai.tech/login');
  await page.getByRole('button', { name: 'Continue as Hackathon Judge' }).click();
  await page.waitForURL('**/feed', { timeout: 60000 });
  await page.waitForTimeout(1500);
  if (!token) throw new Error('No normal bearer session observed');
  const me = await probe('/api/v1/me', true);
  evidence.judgeRoles = me.roles;
  const id = me.id;
  const endpoints = ['/overview', '/growth?days=7', '/growth?days=30', '/growth?days=90', '/users', `/users/${id}`, `/users/${id}/activity`, '/problems/analytics', '/audit-logs', `/users/${id}/roles`, `/users/${id}/progress`, `/users/${id}/practice-attempts`, `/users/${id}/reviews`];
  for (const path of endpoints) {
    await probe('/api/v1/admin' + path);
    await probe('/api/v1/admin' + path, true);
  }
} finally {
  await browser.close();
  await writeFile(resolve(out, 'production-http.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
}
