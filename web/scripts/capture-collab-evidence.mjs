import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), '..');
const shotDir = resolve(root, 'docs/evidence/screenshots/2026-10-11');
const runDir = resolve(root, 'docs/evidence/runs/2026-10-11/COLLAB-01');
await mkdir(shotDir, { recursive: true });
await mkdir(runDir, { recursive: true });
const seed = JSON.parse(await readFile(resolve(root, 'docs/evidence/runs/2026-10-11/SD-01/observed-attempt-1.json'), 'utf8')).seed;
const browser = await chromium.launch({ headless: true });
const contextA = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const contextB = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();
const result = { caseId: 'COLLAB-01', startedAt: new Date().toISOString(), execution: 'live production, two isolated Chromium contexts', seedNodeCount: 3, seedEdgeCount: 2 };
async function login(page) {
  await page.goto('https://www.reasonai.tech/login');
  await page.getByRole('button', { name: 'Continue as Hackathon Judge' }).click();
  await page.waitForURL('**/feed');
}
try {
  await login(pageA);
  await login(pageB);
  await pageA.goto('https://www.reasonai.tech/system-design/canvas');
  await pageA.getByTestId('system-design-canvas').waitFor();
  await pageA.locator('input[type="file"]').setInputFiles({ name: 'messaging-seed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await pageA.getByRole('button', { name: 'Import diagram' }).click();
  result.preShareStatusA = await pageA.getByLabel('Diagram status').innerText();
  await pageA.getByRole('button', { name: 'Live Share' }).click();
  await pageA.locator('#live-share-url').waitFor({ timeout: 30000 });
  const privateShareUrl = await pageA.locator('#live-share-url').inputValue();
  result.roomCreated = privateShareUrl.startsWith('https://www.reasonai.tech/');
  await pageA.getByRole('button', { name: 'Done' }).click();
  await pageB.goto(privateShareUrl);
  await pageB.getByTestId('system-design-canvas').waitFor({ timeout: 30000 });
  await pageB.getByLabel('Diagram status').getByText('3', { exact: true }).first().waitFor({ timeout: 30000 });
  result.joinStatusA = await pageA.getByLabel('Diagram status').innerText();
  result.joinStatusB = await pageB.getByLabel('Diagram status').innerText();
  await pageA.screenshot({ path: resolve(shotDir, 'collab-before-a.png') });
  await pageB.screenshot({ path: resolve(shotDir, 'collab-before-b.png') });
  await pageA.getByRole('button', { name: 'Add note' }).click();
  await pageA.getByLabel('Diagram status').getByText('4', { exact: true }).first().waitFor({ timeout: 10000 });
  await pageB.getByLabel('Diagram status').getByText('4', { exact: true }).first().waitFor({ timeout: 30000 });
  await pageA.getByRole('button', { name: 'Connect tool' }).click();
  await pageA.mouse.move(465, 410);
  await pageA.mouse.down();
  await pageA.mouse.move(780, 493, { steps: 12 });
  await pageA.mouse.up();
  result.afterConnectStatusA = await pageA.getByLabel('Diagram status').innerText();
  result.connectionAdded = result.afterConnectStatusA.includes('Connections 3');
  if (result.connectionAdded) await pageB.getByLabel('Diagram status').getByText('3', { exact: true }).last().waitFor({ timeout: 30000 });
  result.afterEditStatusA = await pageA.getByLabel('Diagram status').innerText();
  result.afterEditStatusB = await pageB.getByLabel('Diagram status').innerText();
  await pageA.screenshot({ path: resolve(shotDir, 'collab-edit-a.png') });
  await pageB.screenshot({ path: resolve(shotDir, 'collab-sync-b.png') });
  await pageB.getByRole('button', { name: 'Select tool' }).click();
  await pageB.mouse.move(780, 490);
  await pageB.mouse.down();
  await pageB.mouse.move(1030, 610, { steps: 15 });
  await pageB.mouse.up();
  await pageB.waitForTimeout(800);
  await pageB.screenshot({ path: resolve(shotDir, 'collab-move-b.png') });
  await pageA.screenshot({ path: resolve(shotDir, 'collab-move-synced-a.png') });
  await pageB.reload();
  await pageB.getByLabel('Diagram status').getByText('4', { exact: true }).first().waitFor({ timeout: 30000 });
  result.afterReconnectStatusB = await pageB.getByLabel('Diagram status').innerText();
  await pageB.screenshot({ path: resolve(shotDir, 'collab-reconnect-b.png') });
} catch (error) { result.error = String(error).slice(0, 500).replace(/https:\/\/[^\s)]+/g, '[private URL redacted]'); }
finally {
  result.finishedAt = new Date().toISOString();
  await writeFile(resolve(runDir, 'observed.json'), JSON.stringify(result, null, 2));
  await browser.close();
  console.log(JSON.stringify(result));
}
