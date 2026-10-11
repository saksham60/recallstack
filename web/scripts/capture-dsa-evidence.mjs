import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), '..');
const shotDir = resolve(root, 'docs/evidence/screenshots/2026-10-11');
const runDir = resolve(root, 'docs/evidence/runs/2026-10-11/DSA-01');
await mkdir(shotDir, { recursive: true });
await mkdir(runDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
await page.addInitScript(() => {
  window.__evidence = [];
  const original = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await original(...args);
    if (String(args[0]).includes('/api/reasonai/dsa/chat')) {
      const entry = { status: response.status, startedAt: new Date().toISOString(), events: [] };
      window.__evidence.push(entry);
      void response.clone().text().then((body) => {
        for (const line of body.split('\n')) {
          try {
            const event = JSON.parse(line);
            if (event.type === 'text.delta') { entry.textDeltaCount = (entry.textDeltaCount ?? 0) + 1; continue; }
            entry.events.push({ type: event.type, runId: event.runId, toolCallId: event.toolCallId,
              toolName: event.toolName, summary: event.summary,
              text: event.type === 'text.final' ? event.text : undefined,
              model: event.type === 'text.final' ? event.model : undefined,
              visualKind: event.type?.includes('visual') ? event.data?.kind ?? event.visual?.kind : undefined,
              visualStepCount: event.type === 'visual.ready' ? event.data?.steps?.length : undefined });
          } catch { /* NDJSON or non-event line */ }
        }
        entry.finishedAt = new Date().toISOString();
      }).catch((error) => { entry.readError = String(error).slice(0, 120); });
    }
    return response;
  };
});
const result = { caseId: 'DSA-01', startedAt: new Date().toISOString(), execution: 'live production browser', slug: 'ultimate-dsa-016-3sum', actions: [] };
try {
  await page.goto('https://www.reasonai.tech/login', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Continue as Hackathon Judge' }).click();
  await page.waitForURL('**/feed');
  await page.goto('https://www.reasonai.tech/dsa/problem/ultimate-dsa-016-3sum');
  await page.getByRole('heading', { name: '3Sum', exact: true }).first().waitFor();
  await page.screenshot({ path: resolve(shotDir, 'dsa-before.png') });
  let start = Date.now();
  if (!process.argv.includes('--visual-only')) {
    await page.getByRole('button', { name: 'Give me a hint' }).click();
    await page.waitForFunction(() => window.__evidence?.[0]?.finishedAt, undefined, { timeout: 120000 });
    result.actions.push({ name: 'hint', durationMs: Date.now() - start, visibleText: (await page.locator('body').innerText()).slice(-2500) });
    await page.screenshot({ path: resolve(shotDir, 'dsa-hint.png') });
  }
  start = Date.now();
  await page.getByRole('button', { name: 'Visual walkthrough' }).click();
  await page.waitForFunction(() => window.__evidence?.at(-1)?.finishedAt, undefined, { timeout: 120000 });
  await page.waitForTimeout(300);
  result.actions.push({ name: 'visual walkthrough', durationMs: Date.now() - start, visibleText: (await page.locator('body').innerText()).slice(-3500) });
  await page.screenshot({ path: resolve(shotDir, 'dsa-visual.png') });
} catch (error) { result.error = String(error).slice(0, 400); }
finally {
  result.finishedAt = new Date().toISOString();
  result.requests = await page.evaluate(() => window.__evidence ?? []).catch(() => []);
  await writeFile(resolve(runDir, process.argv.includes('--visual-only') ? 'observed-visual-retry.json' : 'observed.json'), JSON.stringify(result, null, 2));
  await browser.close();
  console.log(JSON.stringify({ error: result.error, actions: result.actions.map(({name,durationMs}) => ({name,durationMs})), requests: result.requests.map(({status,events}) => ({status, eventTypes: events.map((e) => e.type)})) }));
}
