import nextEnv from '@next/env';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

nextEnv.loadEnvConfig(process.cwd());
const result = { startedAt: new Date().toISOString(), execution: 'direct provider probe; not a product workflow' };
const model = process.env.REASONAI_MODEL || 'nvidia/nemotron-3-super-120b-a12b';
const base = process.env.REASONAI_BASE_URL || 'https://api.tokenfactory.nebius.com/v1';
if (process.env.NEBIUS_API_KEY) {
  const started = Date.now();
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, { method: 'POST', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${process.env.NEBIUS_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with the single word OK.' }], max_tokens: 200, temperature: 0, stream: false }) });
    result.nebius = { requestedModel: model, status: response.status, durationMs: Date.now() - started };
    if (response.ok) {
      const body = await response.json();
      result.nebius.reportedModel = body.model ?? null;
      result.nebius.visibleAnswer = String(body.choices?.[0]?.message?.content ?? '').slice(0, 100);
    }
  } catch (error) { result.nebius = { requestedModel: model, durationMs: Date.now() - started, error: error instanceof Error ? error.name : 'unknown' }; }
} else result.nebius = { missingCredential: true };
if (process.env.TAVILY_API_KEY) {
  const started = Date.now();
  try {
    const response = await fetch('https://api.tavily.com/search', { method: 'POST', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'official cloud architecture messaging queues documentation', search_depth: 'basic', max_results: 2 }) });
    result.tavily = { status: response.status, durationMs: Date.now() - started };
    if (response.ok) {
      const body = await response.json();
      result.tavily.urls = (body.results ?? []).map((item) => item.url).filter((url) => /^https?:\/\//.test(url)).slice(0, 2);
    }
  } catch (error) { result.tavily = { durationMs: Date.now() - started, error: error instanceof Error ? error.name : 'unknown' }; }
} else result.tavily = { missingCredential: true };
result.finishedAt = new Date().toISOString();
const output = resolve(process.cwd(), '../docs/evidence/runs/2026-10-11/provider-probe.json');
await mkdir(resolve(output, '..'), { recursive: true });
await writeFile(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
