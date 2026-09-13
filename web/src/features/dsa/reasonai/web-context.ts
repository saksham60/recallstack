import "server-only";
import { getTavilyConfiguration } from "@/lib/config/server";
import { readBoundedJSON } from "@/lib/http/read-bounded-json";
import { safeExternalUrl, type DSATutorRequest, type DSATutorResponse, type DSATutorSource } from "./contract";

export interface WebContext {
  status: DSATutorResponse["webStatus"];
  results: (DSATutorSource & { content: string })[];
}
export function needsExactProblemContext(message: string): boolean {
  return /(?:what|explain).*?(?:problem.*?(?:asking|asks|means)|requirements)|(?:exact|official|original) (?:problem|requirements|constraints|examples)|problem (?:statement|requirements)|(?:show|give|find).*?(?:requirements|constraints)|(?:more|problem) context|explain (?:this|the) problem/i.test(message);
}
export async function searchDSAContext(request: DSATutorRequest, signal?: AbortSignal): Promise<WebContext> {
  if (!request.searchWeb) return { status: "off", results: [] };
  const { apiKey } = getTavilyConfiguration();
  if (!apiKey) return { status: "unavailable", results: [] };
  const { title, sourceProvider, sourceUrl } = request.context;
  const exact = needsExactProblemContext(request.message);
  // Never send the approach, notes, code or conversation to the search service.
  const query = [title, sourceProvider, exact ? sourceUrl : undefined, request.message.slice(0, 500)].filter(Boolean).join(" ").slice(0, 1000);
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST", cache: "no-store", redirect: "error",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, search_depth: "basic", max_results: 4, include_answer: false, include_raw_content: false,
        ...(exact && sourceUrl ? { include_domains: [new URL(sourceUrl).hostname] } : {}),
      }),
    });
    if (!response.ok) return { status: "unavailable", results: [] };
    const raw = await readBoundedJSON(response, 128 * 1024) as { results?: unknown };
    if (!Array.isArray(raw?.results)) return { status: "unavailable", results: [] };
    const results: WebContext["results"] = [];
    for (const result of raw.results.slice(0, 4)) {
      if (!result || typeof result !== "object") continue;
      const url = safeExternalUrl(result.url);
      if (!url || typeof result.content !== "string" || !result.content.trim()) continue;
      results.push({ url, title: typeof result.title === "string" ? result.title.slice(0, 200) : new URL(url).hostname, content: result.content.slice(0, 4000) });
    }
    return { status: results.length ? "used" : "empty", results };
  } catch { return { status: "unavailable", results: [] }; }
}
