import "server-only";
import { isIP } from "node:net";
import { getReasonAIConfiguration, getTavilyConfiguration } from "@/lib/config/server";
import { readBoundedJSON } from "@/lib/http/read-bounded-json";

export interface TavilyEvidence { title: string; url: string; content: string }
export interface TavilySearchResult { status: "used" | "empty" | "unavailable"; results: TavilyEvidence[] }
export function publicResearchDomain(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 253) return;
  const host = value.toLowerCase();
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) || isIP(host) || /\.(?:local|internal|localhost|test|invalid)$/.test(host)) return;
  return host;
}
export function publicResearchUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port || !publicResearchDomain(url.hostname)) return;
    url.hash = "";
    return url.href;
  } catch { return; }
}
export function redactResearchText(value: string): string {
  let text = value;
  for (const key of [getReasonAIConfiguration().apiKey, getTavilyConfiguration().apiKey]) if (key) text = text.split(key).join("[redacted]");
  return text.replace(/\b(?:Bearer\s+\S+|(?:tvly-|sk-|ghp_|github_pat_)[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/gi, "[redacted]")
    .replace(/\b(api[_ -]?key|password|secret|access[_ -]?token)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
}

/** Fixed endpoint, short snippets, no crawling, no answer generation, no storage. */
export async function searchTavily(input: { query: string; domains?: string[] }, signal?: AbortSignal): Promise<TavilySearchResult> {
  const { apiKey } = getTavilyConfiguration();
  const query = redactResearchText(input.query).trim().slice(0, 400);
  const domains = input.domains?.slice(0, 3).map(publicResearchDomain);
  if (!apiKey || !query || domains?.some((domain) => !domain)) return { status: "unavailable", results: [] };
  try {
    const deadline = AbortSignal.timeout(7000);
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST", cache: "no-store", redirect: "error", signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, search_depth: "basic", max_results: 3, include_answer: false, include_raw_content: false, include_images: false, auto_parameters: false, ...(domains?.length ? { include_domains: domains } : {}) }),
    });
    if (!response.ok) return { status: "unavailable", results: [] };
    const raw = await readBoundedJSON(response, 128 * 1024) as { results?: unknown };
    const results: TavilyEvidence[] = [];
    if (Array.isArray(raw?.results)) for (const item of raw.results.slice(0, 3)) {
      if (!item || typeof item !== "object") continue;
      const url = publicResearchUrl(item.url);
      if (!url || redactResearchText(url) !== url || typeof item.content !== "string" || !item.content.trim()) continue;
      if (domains?.length && !domains.some((domain) => new URL(url).hostname === domain || new URL(url).hostname.endsWith(`.${domain}`))) continue;
      if (!results.some((result) => result.url === url)) results.push({ url, title: redactResearchText(typeof item.title === "string" ? item.title : new URL(url).hostname).slice(0, 200), content: redactResearchText(item.content).trim().slice(0, 2400) });
    }
    return { status: results.length ? "used" : "empty", results };
  } catch { return { status: "unavailable", results: [] }; }
}
