import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), '..');
const shotDir = resolve(root, 'docs/evidence/screenshots/2026-10-11');
const runDir = resolve(root, 'docs/evidence/runs/2026-10-11/KNOW-01');
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
    if (String(args[0]).includes('/api/reasonai/knowledge/chat')) {
      const entry = { status: response.status, startedAt: new Date().toISOString(), events: [] };
      window.__evidence.push(entry);
      void response.clone().text().then((body) => {
        for (const line of body.split('\n')) {
          try {
            const event = JSON.parse(line);
            entry.events.push({ type: event.type, toolName: event.toolName, summary: event.summary,
              code: event.type === 'run.failed' ? event.code : undefined,
              message: event.type === 'run.failed' ? event.message : undefined,
              text: event.type === 'text.final' ? event.text : undefined,
              model: event.type === 'text.final' ? event.model : undefined });
          } catch { /* NDJSON or non-event line */ }
        }
        entry.finishedAt = new Date().toISOString();
      }).catch((error) => { entry.readError = String(error).slice(0, 120); });
    }
    return response;
  };
});
const result = { caseId: 'KNOW-01', startedAt: new Date().toISOString(), execution: 'live production browser', prompt: 'Find two related technical developments from trustworthy sources and explain how they affect the architecture choices in this story.' };
try {
  await page.goto('https://www.reasonai.tech/login', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Continue as Hackathon Judge' }).click();
  await page.waitForURL('**/feed');
  if (process.argv.includes('--architecture')) await page.getByRole('button', { name: 'Architecture', exact: true }).click();
  const storyIndex = process.argv.includes('--second-story') ? 1 : 0;
  await page.getByRole('button', { name: 'Ask ReasonAI' }).nth(storyIndex).waitFor();
  result.storyTitle = (await page.locator('button[aria-label^="Read "]').nth(storyIndex).getAttribute('aria-label')).replace(/^Read /, '');
  result.storyUrl = await page.locator('a[href^="http"]').nth(storyIndex).getAttribute('href');
  await page.screenshot({ path: resolve(shotDir, 'knowledge-story.png') });
  await page.getByRole('button', { name: 'Ask ReasonAI' }).nth(storyIndex).click();
  const chat = page.getByRole('region', { name: 'ReasonAI story conversation' });
  await chat.waitFor({ timeout: 30000 });
  await chat.getByRole('textbox', { name: 'Ask ReasonAI' }).fill(result.prompt);
  const start = Date.now();
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.waitForFunction(() => window.__evidence?.[0]?.finishedAt, undefined, { timeout: 120000 });
  await chat.getByRole('status').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  result.durationMs = Date.now() - start;
  result.chatText = await chat.innerText();
  result.citationUrls = await chat.locator('a[href^="http"]').evaluateAll((links) => links.map((link) => link.href));
  await page.screenshot({ path: resolve(shotDir, 'knowledge-research.png') });
} catch (error) { result.error = String(error).slice(0, 400); }
finally {
  result.finishedAt = new Date().toISOString();
  result.requests = await page.evaluate(() => window.__evidence ?? []).catch(() => []);
  await writeFile(resolve(runDir, 'observed.json'), JSON.stringify(result, null, 2));
  await browser.close();
  console.log(JSON.stringify({ storyTitle: result.storyTitle, error: result.error, durationMs: result.durationMs, citationUrls: result.citationUrls, events: result.requests.map(({status,events}) => ({status, types: events.map((e) => e.type)})) }));
}
