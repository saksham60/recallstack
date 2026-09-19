"use client";

import { useEffect, useRef, useState } from "react";
import { cancelReasonAIRun, fetchReasonAIConversation, fetchReasonAIStreamResponse } from "@/lib/reasonai/client";
import { createReasonAIRuntimeState, interruptReasonAIRun, reduceReasonAIEvent } from "@/lib/reasonai/runtime/reducer";
import type { ReasonAIMessagePart, ReasonAIRuntimeState } from "@/lib/reasonai/runtime/types";
import { decodeReasonAIEventResponse } from "@/lib/reasonai/streaming-client";
import { parseDSATutorRequest, type DSAProblemContext, type DSATutorAction, type DSATutorRequest, type DSATutorResponse } from "./contract";
import { parseVisualLesson } from "./visual-contract";

export interface TutorMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  response?: DSATutorResponse;
}
export function useDSATutor(context: DSAProblemContext) {
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [searchWeb, setSearchWeb] = useState(false);
  const [visualFocus, setVisualFocus] = useState<DSATutorRequest["visualFocus"]>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [authExpired, setAuthExpired] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const hints = useRef(0);
  const sequence = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const restoring = useRef<AbortController | null>(null);
  const conversationId = useRef<string | undefined>(undefined);
  const activeRun = useRef<{ conversationId: string; runId: string } | undefined>(undefined);
  const lastRequest = useRef<DSATutorRequest | null>(null);
  const webContextToken = useRef<string | undefined>(undefined);
  const storageKey = `reasonai:dsa:conversation:${context.contentId}`;
  useEffect(() => {
    const controller = new AbortController();
    restoring.current = controller;
    const stored = localStorage.getItem(storageKey);
    if (stored && /^[0-9a-f-]{36}$/i.test(stored)) void restoreConversation(stored, controller.signal);
    return () => {
      controller.abort();
      if (restoring.current === controller) restoring.current = null;
      inFlight.current?.abort();
      inFlight.current = null;
    };
  // The active transcript is scoped only by the stable problem identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  async function restoreConversation(id: string, signal?: AbortSignal) {
    try {
      const response = await fetchReasonAIConversation(id, signal);
      if (response.status === 404) { localStorage.removeItem(storageKey); return; }
      if (!response.ok) return;
      const body = await response.json() as { conversation?: { id?: unknown; surface?: unknown; contextId?: unknown; messages?: unknown } };
      const restored = body.conversation;
      if (!restored || restored.id !== id || restored.surface !== "dsa" || restored.contextId !== context.contentId || !Array.isArray(restored.messages)) {
        localStorage.removeItem(storageKey);
        return;
      }
      const next: TutorMessage[] = [];
      let latestToken: string | undefined;
      for (const value of restored.messages) {
        const parsed = restoredMessage(value, ++sequence.current);
        if (parsed) {
          next.push(parsed);
          if (parsed.response?.webContextToken) latestToken = parsed.response.webContextToken;
        }
      }
      if (signal?.aborted || inFlight.current) return;
      conversationId.current = id;
      webContextToken.current = latestToken;
      setMessages(next);
    } catch { /* Restoration is optional for the current workspace session. */ }
  }

  function restoredMessage(value: unknown, id: number): TutorMessage | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const message = value as { role?: unknown; parts?: unknown; status?: unknown };
    if ((message.role !== "user" && message.role !== "assistant") || !Array.isArray(message.parts)
      || !["completed", "cancelled", "failed", "interrupted"].includes(String(message.status))) return;
    const parts = message.parts.filter((part): part is ReasonAIMessagePart => Boolean(part) && typeof part === "object" && !Array.isArray(part));
    const text = parts.flatMap((part) => part.type === "text" && typeof part.text === "string" ? [part.text] : []).join("");
    if (message.role === "user") return text ? { id, role: "user", content: text } : undefined;
    const sourcesPart = [...parts].reverse().find((part) => part.type === "sources");
    const visualPart = [...parts].reverse().find((part) => part.type === "visual");
    const sources = sourcesPart?.sources.filter((source) => {
      try { const url = new URL(source.url); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; }
      catch { return false; }
    }).map(({ title, url, kind }) => ({
      title,
      url,
      ...(kind === "source" ? { kind: "source" as const } : kind === "search" ? { kind: "search" as const } : {}),
    })) ?? [];
    let visual;
    try { if (visualPart) visual = parseVisualLesson(visualPart.data); } catch { visual = undefined; }
    const response: DSATutorResponse = {
      text,
      sources,
      webStatus: sourcesPart?.retrievalStatus ?? "off",
      ...(sourcesPart?.contextToken ? { webContextToken: sourcesPart.contextToken } : {}),
      ...(sourcesPart?.notice ? { notice: sourcesPart.notice } : {}),
      ...(visual ? { visual } : {}),
    };
    return text || visual ? { id, role: "assistant", content: text, response } : undefined;
  }

  function runtimeResponse(state: ReasonAIRuntimeState): DSATutorResponse | undefined {
    const assistant = [...state.messages].reverse().find((message) => message.role === "assistant");
    if (!assistant) return;
    const text = assistant.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
    const sourcePart = [...assistant.parts].reverse().find((part) => part.type === "sources");
    const visualPart = [...assistant.parts].reverse().find((part) => part.type === "visual");
    let visual;
    let notice = sourcePart?.notice;
    if (visualPart) {
      try { visual = parseVisualLesson(visualPart.data); }
      catch { notice = [notice, "The visual could not be displayed. You can still read the explanation or ask for another walkthrough."].filter(Boolean).join(" "); }
    }
    return {
      text,
      sources: sourcePart?.sources.map(({ title, url, kind }) => ({ title, url, ...(kind === "source" || kind === "search" ? { kind } : {}) })) ?? [],
      webStatus: sourcePart?.retrievalStatus ?? "off",
      ...(sourcePart?.contextToken ? { webContextToken: sourcePart.contextToken } : {}),
      ...(visual ? { visual } : {}),
      ...(notice ? { notice } : {}),
    };
  }

  function upsertStreamingAssistant(id: number, response: DSATutorResponse) {
    setMessages((current) => {
      const index = current.findIndex((message) => message.id === id);
      const message: TutorMessage = { id, role: "assistant", content: response.text, response };
      if (index < 0) return [...current, message];
      const next = current.slice();
      next[index] = message;
      return next;
    });
  }

  async function perform(request: DSATutorRequest) {
    const controller = new AbortController();
    inFlight.current = controller;
    setPending(true); setError(undefined); setAuthExpired(false);
    const timeout = setTimeout(() => controller.abort(), 65_000);
    try {
      const response = await fetchReasonAIStreamResponse("/api/reasonai/dsa/chat", JSON.stringify(request), controller.signal);
      if (inFlight.current !== controller) return;
      const responseConversationId = response.headers.get("X-ReasonAI-Conversation-Id") ?? undefined;
      const responseRunId = response.headers.get("X-ReasonAI-Run-Id") ?? undefined;
      if (responseConversationId && /^[0-9a-f-]{36}$/i.test(responseConversationId)) {
        conversationId.current = responseConversationId;
        localStorage.setItem(storageKey, responseConversationId);
        if (responseRunId && /^[0-9a-f-]{36}$/i.test(responseRunId)) activeRun.current = { conversationId: responseConversationId, runId: responseRunId };
      }
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType.includes("application/x-ndjson")) {
        let runtime = createReasonAIRuntimeState();
        const assistantId = ++sequence.current;
        let result: DSATutorResponse | undefined;
        for await (const event of decodeReasonAIEventResponse(response)) {
          if (inFlight.current !== controller) return;
          runtime = reduceReasonAIEvent(runtime, event);
          const next = runtimeResponse(runtime);
          if (next) {
            result = next;
            upsertStreamingAssistant(assistantId, next);
          }
        }
        runtime = interruptReasonAIRun(runtime);
        if (runtime.status === "failed") throw new Error(runtime.error?.message ?? "ReasonAI is unavailable. Please try again.");
        if (runtime.status === "cancelled") throw new DOMException("Response stopped.", "AbortError");
        if (runtime.status !== "completed" || !result?.text) throw new Error("ReasonAI stream ended before the answer completed. Please try again.");
        webContextToken.current = result.webContextToken;
        lastRequest.current = null;
        setCanRetry(false);
        return;
      }
      const result = await response.json();
      if (inFlight.current !== controller) return;
      if (!response.ok) {
        setAuthExpired(response.status === 401);
        throw new Error(typeof result.error === "string" ? result.error : "ReasonAI is unavailable. Please try again.");
      }
      if (result?.replayed === true && typeof result.conversationId === "string") {
        await restoreConversation(result.conversationId, controller.signal);
        lastRequest.current = null;
        setCanRetry(false);
        return;
      }
      if (typeof result.text !== "string" || !Array.isArray(result.sources)) throw new Error("ReasonAI returned an incomplete answer. Please try again.");
      if (result.visual) {
        try { result.visual = parseVisualLesson(result.visual); }
        catch { delete result.visual; result.notice = "The visual could not be displayed. You can still read the explanation or ask for another walkthrough."; }
      }
      webContextToken.current = typeof result.webContextToken === "string" && result.webContextToken.length <= 64000 ? result.webContextToken : undefined;
      if (inFlight.current !== controller) return;
      setMessages((current) => [...current, { id: ++sequence.current, role: "assistant", content: result.text, response: result }]);
      lastRequest.current = null;
      setCanRetry(false);
    } catch (error) {
      if (inFlight.current !== controller) return;
      setError(controller.signal.aborted ? "ReasonAI timed out. Your work is still here; try again." : error instanceof TypeError ? "Unable to connect to ReasonAI. Check your connection and try again." : error instanceof Error ? error.message : "ReasonAI is unavailable. Please try again.");
    } finally {
      clearTimeout(timeout);
      if (inFlight.current === controller) { inFlight.current = null; activeRun.current = undefined; setPending(false); }
    }
  }
  function send(action: DSATutorAction, message: string, webOverride?: boolean) {
    if (inFlight.current || !message.trim()) return;
    if (action === "review" && !context.userApproach.trim() && !context.userCode.trim()) {
      setError("Write your approach or paste your code first, then ask for a review."); return;
    }
    const nextHint = action === "hint" ? Math.min(hints.current + 1, 20) : hints.current;
    let request: DSATutorRequest;
    restoring.current?.abort();
    restoring.current = null;
    try {
      request = parseDSATutorRequest({ action, message, searchWeb: webOverride ?? searchWeb, hintLevel: nextHint, context,
        history: messages.slice(-12).map(({ role, content, response }) => ({ role, content: response?.visual ? (content + "\nVisual walkthrough (untrusted earlier explanation): " + JSON.stringify(response.visual)).slice(0, 12000) : content })),
        ...(webContextToken.current ? { webContextToken: webContextToken.current } : {}),
        ...(visualFocus ? { visualFocus } : {}),
        ...(conversationId.current ? { conversationId: conversationId.current } : {}),
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) { setError(error instanceof Error ? error.message : "Check the workspace text length."); return; }
    hints.current = nextHint;
    if (webOverride !== undefined) setSearchWeb(webOverride);
    lastRequest.current = request;
    setCanRetry(true);
    setMessages((current) => [...current, { id: ++sequence.current, role: "user", content: message }]);
    if (message === draft) setDraft("");
    void perform(request);
  }
  function clear() {
    const run = activeRun.current;
    if (run) void cancelReasonAIRun(run.conversationId, run.runId).catch(() => undefined);
    inFlight.current?.abort(); inFlight.current = null; lastRequest.current = null;
    restoring.current?.abort(); restoring.current = null;
    activeRun.current = undefined; conversationId.current = undefined;
    localStorage.removeItem(storageKey);
    setCanRetry(false);
    webContextToken.current = undefined;
    setVisualFocus(undefined);
    hints.current = 0; setPending(false); setMessages([]); setError(undefined); setAuthExpired(false);
  }
  return { messages, draft, setDraft, searchWeb, setSearchWeb, visualFocus, setVisualFocus, pending, error, authExpired, send, clear,
    canRetry, retry: () => {
      if (!inFlight.current && lastRequest.current) {
        const next = { ...lastRequest.current, idempotencyKey: crypto.randomUUID(), ...(conversationId.current ? { conversationId: conversationId.current } : {}) };
        lastRequest.current = next;
        void perform(next);
      }
    },
    stop: () => {
      const run = activeRun.current;
      if (run) void cancelReasonAIRun(run.conversationId, run.runId).catch(() => undefined);
      inFlight.current?.abort(); inFlight.current = null; activeRun.current = undefined;
      setPending(false); setError("Response stopped. You can retry when ready.");
    },
  };
}
export type DSATutor = ReturnType<typeof useDSATutor>;
