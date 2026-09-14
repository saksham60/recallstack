import type { VisualLesson } from "./visual-contract";

export const DSA_ACTIONS = ["chat", "hint", "explain", "start", "trace", "visualize", "review", "complexity", "research", "solution"] as const;
export type DSATutorAction = typeof DSA_ACTIONS[number];

export interface DSAProblemContext {
  contentId: string;
  slug: string;
  title: string;
  difficulty?: string;
  category?: string;
  sourceProvider?: string;
  sourceUrl?: string;
  summary?: string;
  companies?: string[];
  remarks?: string;
  userApproach: string;
  userNotes: string;
  userCode: string;
}
export interface DSATutorRequest {
  action: DSATutorAction;
  message: string;
  searchWeb: boolean;
  hintLevel: number;
  context: DSAProblemContext;
  history: { role: "user" | "assistant"; content: string }[];
  webContextToken?: string;
  visualFocus?: { lessonTitle: string; stepNumber: number; stepTitle: string };
}
export interface DSATutorSource { title: string; url: string; kind?: "source" | "search" }
export interface DSATutorResponse {
  text: string;
  sources: DSATutorSource[];
  webStatus: "off" | "used" | "cached" | "unavailable" | "empty";
  webContextToken?: string;
  visual?: VisualLesson;
  notice?: string;
}
export class DSAValidationError extends Error {}

export function safeExternalUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return;
    return url.href;
  } catch { return; }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DSAValidationError("Invalid request data.");
  return value as Record<string, unknown>;
}
function text(value: unknown, limit: number): string {
  if (typeof value !== "string" || value.length > limit) throw new DSAValidationError(`Text must be at most ${limit.toLocaleString("en-US")} characters.`);
  return value;
}
function only(value: Record<string, unknown>, fields: string[]) {
  if (Object.keys(value).some((key) => !fields.includes(key))) throw new DSAValidationError("Unsupported request field.");
}
export function parseDSATutorRequest(value: unknown): DSATutorRequest {
  const input = record(value), context = record(input.context);
  only(input, ["action", "message", "searchWeb", "hintLevel", "context", "history", "webContextToken", "visualFocus"]);
  only(context, ["contentId", "slug", "title", "difficulty", "category", "sourceProvider", "sourceUrl", "summary", "companies", "remarks", "userApproach", "userNotes", "userCode"]);
  if (!DSA_ACTIONS.includes(input.action as DSATutorAction)) throw new DSAValidationError("Unknown tutor action.");
  if (typeof input.searchWeb !== "boolean" || !Number.isInteger(input.hintLevel) || Number(input.hintLevel) < 0 || Number(input.hintLevel) > 20) throw new DSAValidationError("Invalid tutor options.");
  if (!Array.isArray(input.history) || input.history.length > 12) throw new DSAValidationError("Conversation is too long.");
  const parsed: DSAProblemContext = {
    contentId: text(context.contentId, 256), slug: text(context.slug, 300), title: text(context.title, 300),
    userApproach: text(context.userApproach, 12000), userNotes: text(context.userNotes, 12000), userCode: text(context.userCode, 24000),
  };
  if (!parsed.title.trim() || !parsed.contentId.trim() || !parsed.slug.trim()) throw new DSAValidationError("Problem metadata is required.");
  for (const key of ["difficulty", "category", "sourceProvider", "summary", "remarks"] as const) {
    if (context[key] !== undefined) parsed[key] = text(context[key], key === "summary" || key === "remarks" ? 4000 : 300);
  }
  if (context.sourceUrl !== undefined) {
    parsed.sourceUrl = safeExternalUrl(context.sourceUrl);
    if (!parsed.sourceUrl) throw new DSAValidationError("Invalid source URL.");
  }
  if (context.companies !== undefined) {
    if (!Array.isArray(context.companies) || context.companies.length > 50) throw new DSAValidationError("Invalid companies.");
    parsed.companies = context.companies.map((company) => text(company, 200));
  }
  const message = text(input.message, 4000).trim();
  if (!message) throw new DSAValidationError("Enter a message for ReasonAI.");
  let visualFocus: DSATutorRequest["visualFocus"];
  if (input.visualFocus !== undefined) {
    const focus = record(input.visualFocus);
    only(focus, ["lessonTitle", "stepNumber", "stepTitle"]);
    if (!Number.isInteger(focus.stepNumber) || Number(focus.stepNumber) < 1 || Number(focus.stepNumber) > 12) throw new DSAValidationError("Invalid visual step.");
    visualFocus = { lessonTitle: text(focus.lessonTitle, 120), stepNumber: Number(focus.stepNumber), stepTitle: text(focus.stepTitle, 100) };
  }
  return {
    action: input.action as DSATutorAction, message, searchWeb: input.searchWeb, hintLevel: Number(input.hintLevel), context: parsed,
    ...(input.webContextToken !== undefined ? { webContextToken: text(input.webContextToken, 64000) } : {}),
    ...(visualFocus ? { visualFocus } : {}),
    history: input.history.map((value) => {
      const item = record(value);
      only(item, ["role", "content"]);
      if (item.role !== "user" && item.role !== "assistant") throw new DSAValidationError("Invalid conversation role.");
      return { role: item.role, content: text(item.content, 12000) };
    }),
  };
}
