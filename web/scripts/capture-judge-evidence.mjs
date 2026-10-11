import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), '..');
const output = resolve(root, 'docs/evidence/screenshots/2026-10-11');
await mkdir(output, { recursive: true });
await mkdir(resolve(root, 'docs/evidence/runs/2026-10-11'), { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const startedAt = new Date().toISOString();
const result = { startedAt, execution: 'live production browser', freshContext: true };
try {
  const response = await page.goto('https://www.reasonai.tech/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  result.loginHttpStatus = response?.status();
  await page.getByText('Loading...', { exact: true }).waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
  result.pageText = (await page.locator('body').innerText()).slice(0, 300);
  const judgeButton = page.getByRole('button', { name: 'Continue as Hackathon Judge' });
  result.judgeButtonVisible = await judgeButton.isVisible();
  await page.screenshot({ path: resolve(output, 'judge-login-before.png') });
  if (result.judgeButtonVisible) {
    await judgeButton.click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login') || url.searchParams.has('error'), { timeout: 45000 }).catch(() => {});
    result.finalPath = new URL(page.url()).pathname;
    result.finalError = new URL(page.url()).searchParams.get('error');
    result.signedIn = result.finalPath === '/feed';
    await page.screenshot({ path: resolve(output, 'judge-login-after.png') });
  }
} catch (error) {
  result.error = String(error).slice(0, 400);
} finally {
  result.finishedAt = new Date().toISOString();
  await writeFile(resolve(root, 'docs/evidence/runs/2026-10-11/observed-judge.json'), JSON.stringify(result, null, 2));
  await browser.close();
  console.log(JSON.stringify(result));
}
