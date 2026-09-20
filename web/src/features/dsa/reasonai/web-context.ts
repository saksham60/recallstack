import "server-only";
import { isIP } from "node:net";
import { getTavilyConfiguration } from "@/lib/config/server";
import { readBoundedJSON } from "@/lib/http/read-bounded-json";
import { safeExternalUrl, type DSATutorRequest, type DSATutorResponse, type DSATutorSource } from "./contract";
import { readWebContextToken } from "./web-context-token";

export interface WebContext {
  status: DSATutorResponse["webStatus"];
  results: (DSATutorSource & { content: string })[];
}
export function needsExactProblemContext(message: string): boolean {
  return /(?:what|explain).*?(?:problem.*?(?:asking|asks|means)|requirements)|(?:exact|official|original) (?:problem|requirements|constraints|examples)|problem (?:statement|requirements)|(?:show|give|find).*?(?:requirements|constraints)|(?:more|problem) context|explain (?:this|the) problem/i.test(message);
}
export function needsLinkedContext(request: DSATutorRequest): boolean {
  return needsExactProblemContext(request.message) || ["hint", "explain", "start", "trace", "visualize", "review", "solution"].includes(request.action)
    || /\b(?:this|current|the) (?:problem|question|task)\b|\b(?:is it|why is it) (?:really )?(?:easy|hard|medium)\b/i.test(request.message);
}
function publicSource(value?: string): string | undefined {
  const safe = safeExternalUrl(value);
  if (!safe) return;
  const url = new URL(safe), host = url.hostname;
  if (isIP(host.replace(/^\[|\]$/g, "")) || !host.includes(".") || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host) || url.port && !["80", "443"].includes(url.port)) return;
  return safe;
}
function usableContent(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const text = value.trim();
  if (text.length < 80 || /^(?:access denied|just a moment|verify you are human|enable javascript|403 forbidden)/i.test(text)) return;
  return text.slice(0, 6500);
}
function samePage(left: string, right: string): boolean {
  const identity = (value: string) => { const url = new URL(value); return url.hostname.replace(/^www\./, "") + url.pathname.replace(/\/+$/, ""); };
  return identity(left) === identity(right);
}
function hasProblemContent(content: string): boolean {
  // Successful HTTP extraction can still be a sign-in or marketing shell.
  // Require task-bearing prose before it can stand in for problem context.
  return /\binput\b/i.test(content) && /\boutput\b/i.test(content)
    || /\b(?:given|your task|task is|return|find|determine|compute|calculate|implement)\b/i.test(content)
      && /\b(?:array|string|integer|node|list|tree|graph|matrix|number|element|character|value|input|output)\b/i.test(content);
}
async function tavily(endpoint: "extract" | "search", body: object, key: string, signal: AbortSignal): Promise<Record<string, unknown> | undefined> {
  try {
    const response = await fetch(`https://api.tavily.com/${endpoint}`, {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(endpoint === "extract" ? 10_000 : 7_000)]),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!response.ok) return;
    return await readBoundedJSON(response, 256 * 1024) as Record<string, unknown>;
  } catch (error) {
    if (signal.aborted) throw error;
    return;
  }
}

export const MAX_SEARCH_RESULTS = 5;
export const MAX_SEARCH_SNIPPET_CHARS = 1_500;

/** Executes the PR6 model-selected search tool and returns compact evidence only. */
export async function searchDSAWebEvidence(query: string, signal: AbortSignal): Promise<WebContext> {
  const normalized = query.trim();
  if (!normalized || normalized.length > 500) throw new Error("Invalid search query.");
  const { apiKey } = getTavilyConfiguration();
  if (!apiKey) return { status: "unavailable", results: [] };
  const raw = await tavily("search", {
    query: normalized,
    search_depth: "basic",
    max_results: MAX_SEARCH_RESULTS,
    include_answer: false,
    include_raw_content: false,
  }, apiKey, signal);
  if (!raw) return { status: "unavailable", results: [] };
  const results: WebContext["results"] = [];
  if (Array.isArray(raw.results)) {
    for (const item of raw.results.slice(0, MAX_SEARCH_RESULTS)) {
      const url = publicSource(item?.url);
      const content = usableContent(item?.content)?.slice(0, MAX_SEARCH_SNIPPET_CHARS);
      if (!url || !content || results.some((result) => result.url === url)) continue;
      results.push({
        title: typeof item.title === "string" && item.title.trim()
          ? item.title.trim().slice(0, 200)
          : new URL(url).hostname,
        url,
        kind: "search",
        content,
      });
    }
  }
  return { status: results.length ? "used" : "empty", results };
}

export async function searchDSAContext(request: DSATutorRequest, signal?: AbortSignal): Promise<WebContext> {
  const cached = readWebContextToken(request.context, request.webContextToken);
  if (cached && !request.searchWeb) return { status: "cached", results: cached };
  const sourceUrl = publicSource(request.context.sourceUrl);
  const linked = needsLinkedContext(request);
  if (!request.searchWeb && !(sourceUrl && linked)) return { status: "off", results: [] };
  const { apiKey } = getTavilyConfiguration();
  if (!apiKey) return cached ? { status: "cached", results: cached } : { status: "unavailable", results: [] };
  const deadline = AbortSignal.timeout(20_000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const { title, sourceProvider } = request.context;
  let hadResponse = false;
  const primary: WebContext["results"] = [];
  if (sourceUrl && linked) {
    const extracted = await tavily("extract", {
      urls: [sourceUrl], query: `${title} problem description input output requirements examples constraints`,
      chunks_per_source: 3, extract_depth: "advanced", format: "text", timeout: 8, include_images: false,
    }, apiKey, combined);
    hadResponse ||= Boolean(extracted);
    if (Array.isArray(extracted?.results)) {
      for (const item of extracted.results) {
        const content = usableContent(item?.raw_content), url = publicSource(item?.url);
        if (content && hasProblemContent(content) && url && samePage(url, sourceUrl)) {
          primary.push({ title: `${title} — ${sourceProvider || new URL(url).hostname}`, url, kind: "source", content });
          break;
        }
      }
    }
  }
  if (primary.length && !request.searchWeb) return { status: "used", results: primary };
  // Only the current question and public metadata go to search, never workspace
  // notes, code, approach, previous messages or the signed context token.
  const query = [title, sourceProvider, linked && !primary.length ? sourceUrl : undefined, linked && !request.searchWeb ? "problem requirements input output" : request.message.slice(0, 500)].filter(Boolean).join(" ").slice(0, 1000);
  const search = async (restricted: boolean) => {
    const raw = await tavily("search", { query, search_depth: "basic", max_results: 4, include_answer: false, include_raw_content: false,
      ...(restricted && sourceUrl ? { include_domains: [new URL(sourceUrl).hostname] } : {}),
    }, apiKey, combined);
    hadResponse ||= Boolean(raw);
    const results: WebContext["results"] = [];
    if (Array.isArray(raw?.results)) for (const item of raw.results.slice(0, 4)) {
      const url = publicSource(item?.url), content = usableContent(item?.content);
      if (url && content && (!linked || hasProblemContent(content)) && !results.some((result) => result.url === url)) results.push({
        title: typeof item.title === "string" ? item.title.slice(0, 200) : new URL(url).hostname,
        url, content: content.slice(0, 4000), kind: "search",
      });
    }
    // Search engines also return category pages and unrelated articles. When
    // the linked page is present, use that page's requirements, not neighbors.
    const exact = sourceUrl && linked ? results.filter((item) => samePage(item.url, sourceUrl)) : [];
    return exact.length && (!request.searchWeb || needsExactProblemContext(request.message)) ? exact : results;
  };
  const restricted = Boolean(linked && sourceUrl && !primary.length);
  let results = await search(restricted);
  if (!results.length && restricted && !combined.aborted) results = await search(false);
  if (primary.length || results.length) return { status: "used", results: [...primary, ...results.filter((item) => !primary.some((source) => source.url === item.url))].slice(0, 4) };
  if (cached) return { status: "cached", results: cached };
  return { status: hadResponse ? "empty" : "unavailable", results: [] };
}
