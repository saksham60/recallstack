import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), '..');
const shotDir = resolve(root, 'docs/evidence/screenshots/2026-10-11');
const runDir = resolve(root, 'docs/evidence/runs/2026-10-11/SD-01');
await mkdir(shotDir, { recursive: true });
await mkdir(runDir, { recursive: true });
const now = new Date().toISOString();
const rootId = 'evidence-messaging-root';
const node = (id, type, label, x, y) => ({ id, type, label, x, y, width: 170, height: 92, layer: 0, locked: false, visible: true });
const edge = (id, sourceNodeId, targetNodeId, type, label) => ({ id, sourceNodeId, targetNodeId, sourcePort: 'right', targetPort: 'left', type, label });
const seed = { schemaVersion: 3, id: 'evidence-messaging-document', title: 'Messaging architecture evidence seed', status: 'in_progress', rootDiagramId: rootId,
  diagrams: { [rootId]: { id: rootId, name: 'Messaging platform', nodes: [
    node('mobile-client', 'mobile_app', 'Mobile clients', 80, 210),
    node('chat-service', 'service', 'Chat service', 380, 210),
    node('message-store', 'sql_database', 'Message store', 680, 210),
  ], edges: [
    edge('client-chat', 'mobile-client', 'chat-service', 'websocket', 'Live messages'),
    edge('chat-store', 'chat-service', 'message-store', 'database_write', 'Persist messages'),
  ], viewport: { x: 0, y: 0, zoom: 1 } } }, createdAt: now, updatedAt: now };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
await page.addInitScript(() => {
  window.__evidence = [];
  const original = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await original(...args);
    if (String(args[0]).includes('/api/reasonai/chat')) {
      const entry = { status: response.status, traceId: response.headers.get('x-reasonai-trace-id'), startedAt: new Date().toISOString(), events: [] };
      window.__evidence.push(entry);
      void response.clone().text().then((body) => {
        for (const line of body.split('\n')) {
          try {
            const event = JSON.parse(line);
            entry.events.push({ type: event.type, toolName: event.toolName, summary: event.summary,
              code: event.type === 'run.failed' ? event.code : undefined,
              message: event.type === 'run.failed' ? event.message : undefined,
              text: event.type === 'text.final' ? event.text : undefined,
              model: event.type === 'text.final' ? event.model : undefined,
              proposal: event.type === 'artifact.proposal' ? event.data : undefined });
          } catch { /* NDJSON or non-event line */ }
        }
        entry.finishedAt = new Date().toISOString();
      }).catch((error) => { entry.readError = String(error).slice(0, 120); });
    }
    return response;
  };
});
const result = { caseId: 'SD-01', startedAt: new Date().toISOString(), execution: 'live production browser', seed, prompt: 'Design a messaging platform for one million concurrent users. Review the current diagram for bottlenecks and propose missing components and links.' };
try {
  await page.goto('https://www.reasonai.tech/login', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Continue as Hackathon Judge' }).click();
  await page.waitForURL('**/feed');
  await page.goto('https://www.reasonai.tech/system-design/canvas');
  await page.getByTestId('system-design-canvas').waitFor();
  await page.locator('input[type="file"]').setInputFiles({ name: 'messaging-seed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await page.getByRole('button', { name: 'Import diagram' }).click();
  await page.getByLabel('Diagram status').getByText('3', { exact: true }).first().waitFor({ timeout: 15000 }).catch(() => {});
  result.beforeStatus = await page.getByLabel('Diagram status').innerText();
  await page.screenshot({ path: resolve(shotDir, 'system-design-before.png') });
  await page.getByRole('button', { name: 'Open ReasonAI' }).click();
  await page.getByRole('button', { name: 'Improve', exact: true }).click();
  if (process.argv.includes('--super')) await page.getByLabel('ReasonAI model').selectOption('super');
  await page.getByLabel('Message ReasonAI').fill(result.prompt);
  const started = Date.now();
  await page.getByRole('button', { name: 'Send to ReasonAI' }).click();
  await page.waitForFunction(() => window.__evidence?.[0]?.finishedAt, undefined, { timeout: 150000 });
  result.durationMs = Date.now() - started;
  result.proposalVisible = await page.getByLabel('Suggested changes').isVisible().catch(() => false);
  result.pendingStatus = await page.getByLabel('Diagram status').innerText();
  result.proposalText = (await page.getByRole('dialog', { name: 'ReasonAI', exact: true }).innerText()).slice(-4000);
  await page.screenshot({ path: resolve(shotDir, 'system-design-proposal.png') });
  if (result.proposalVisible) {
    const accept = page.getByRole('button', { name: 'Accept All' });
    result.acceptEnabled = await accept.isEnabled();
    if (result.acceptEnabled) {
      await accept.click();
      await page.waitForTimeout(800);
      result.afterStatus = await page.getByLabel('Diagram status').innerText();
      result.acceptText = (await page.getByRole('dialog', { name: 'ReasonAI', exact: true }).innerText()).slice(-1000);
      await page.screenshot({ path: resolve(shotDir, 'system-design-after.png') });
    }
  }
} catch (error) { result.error = String(error).slice(0, 500); }
finally {
  result.finishedAt = new Date().toISOString();
  result.requests = await page.evaluate(() => window.__evidence ?? []).catch(() => []);
  await writeFile(resolve(runDir, 'observed.json'), JSON.stringify(result, null, 2));
  await browser.close();
  console.log(JSON.stringify({ error: result.error, beforeStatus: result.beforeStatus, pendingStatus: result.pendingStatus, proposalVisible: result.proposalVisible, afterStatus: result.afterStatus, requests: result.requests.map(({status,traceId,events}) => ({status,traceId,eventTypes: events.map((e) => e.type)})) }));
}
