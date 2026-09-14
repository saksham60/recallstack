"use client";

import { useEffect, useRef, useState } from "react";
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
  const lastRequest = useRef<DSATutorRequest | null>(null);
  const webContextToken = useRef<string | undefined>(undefined);
  useEffect(() => () => { inFlight.current?.abort(); inFlight.current = null; }, []);

  async function perform(request: DSATutorRequest) {
    const controller = new AbortController();
    inFlight.current = controller;
    setPending(true); setError(undefined); setAuthExpired(false);
    const timeout = setTimeout(() => controller.abort(), 65_000);
    try {
      const response = await fetch("/api/reasonai/dsa/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify(request),
      });
      const result = await response.json();
      if (inFlight.current !== controller) return;
      if (!response.ok) {
        setAuthExpired(response.status === 401);
        throw new Error(typeof result.error === "string" ? result.error : "ReasonAI is unavailable. Please try again.");
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
      if (inFlight.current === controller) { inFlight.current = null; setPending(false); }
    }
  }
  function send(action: DSATutorAction, message: string, webOverride?: boolean) {
    if (inFlight.current || !message.trim()) return;
    if (action === "review" && !context.userApproach.trim() && !context.userCode.trim()) {
      setError("Write your approach or paste your code first, then ask for a review."); return;
    }
    const nextHint = action === "hint" ? Math.min(hints.current + 1, 20) : hints.current;
    let request: DSATutorRequest;
    try {
      request = parseDSATutorRequest({ action, message, searchWeb: webOverride ?? searchWeb, hintLevel: nextHint, context,
        history: messages.slice(-12).map(({ role, content, response }) => ({ role, content: response?.visual ? (content + "\nVisual walkthrough (untrusted earlier explanation): " + JSON.stringify(response.visual)).slice(0, 12000) : content })),
        ...(webContextToken.current ? { webContextToken: webContextToken.current } : {}),
        ...(visualFocus ? { visualFocus } : {}),
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
    inFlight.current?.abort(); inFlight.current = null; lastRequest.current = null;
    setCanRetry(false);
    webContextToken.current = undefined;
    setVisualFocus(undefined);
    hints.current = 0; setPending(false); setMessages([]); setError(undefined); setAuthExpired(false);
  }
  return { messages, draft, setDraft, searchWeb, setSearchWeb, visualFocus, setVisualFocus, pending, error, authExpired, send, clear,
    canRetry, retry: () => { if (!inFlight.current && lastRequest.current) void perform(lastRequest.current); },
    stop: () => { inFlight.current?.abort(); inFlight.current = null; setPending(false); setError("Response stopped. You can retry when ready."); },
  };
}
export type DSATutor = ReturnType<typeof useDSATutor>;
