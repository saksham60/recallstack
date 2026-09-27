"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ReasonAIComposer } from "@/components/reasonai/ReasonAIComposer";
import { ReasonAIMarkdown } from "@/components/reasonai/ReasonAIMarkdown";
import { streamReasonAI } from "@/lib/reasonai/client";
import { ReasonAIStreamResponseError } from "@/lib/reasonai/streaming-client";
import { createReasonAIRuntimeState, interruptReasonAIRun, reduceReasonAIEvent } from "@/lib/reasonai/runtime/reducer";
import { storyCategory, storyLink, type FeedStory } from "./model";
import { feedButton } from "./StoryCard";

const suggestions = ["Explain this simply", "Why does this matter?", "Explain the architecture", "Give me a practical example", "What could an interviewer ask?"];
type Turn = { role: "user" | "assistant"; content: string; complete?: boolean };

export function StoryChat({ story }: { story: FeedStory }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ text: string; auth?: boolean }>();
  const active = useRef<AbortController | null>(null);
  const lastRequest = useRef<{ message: string; history: Turn[] } | null>(null);
  const latest = useRef<HTMLElement>(null);
  useEffect(() => () => { active.current?.abort(); }, []);
  useEffect(() => { latest.current?.scrollIntoView({ block: "start" }); }, [turns.length]);

  async function send(message: string, retry = false) {
    if (active.current || !message.trim()) return;
    const request = retry ? lastRequest.current : { message: message.trim(), history: turns.filter((turn) => turn.complete).slice(-12) };
    if (!request) return;
    lastRequest.current = request;
    const controller = new AbortController();
    active.current = controller;
    setError(undefined); setPending(true); setDraft("");
    const previous = request.history;
    setTurns([...previous, { role: "user", content: request.message, complete: true }, { role: "assistant", content: "" }]);
    let runtime = createReasonAIRuntimeState();
    let text = "";
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(75000)]);
      for await (const event of streamReasonAI("/api/reasonai/knowledge/chat", JSON.stringify({ context: story, message: request.message, history: request.history.map(({ role, content }) => ({ role, content })) }), signal)) {
        if (active.current !== controller) return;
        runtime = reduceReasonAIEvent(runtime, event);
        const assistant = runtime.messages.find((item) => item.role === "assistant");
        text = assistant?.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join("") ?? "";
        setTurns([...previous, { role: "user", content: request.message, complete: true }, { role: "assistant", content: text, complete: runtime.status === "completed" }]);
      }
      runtime = interruptReasonAIRun(runtime);
      if (runtime.status !== "completed" || !text) throw new Error(runtime.error?.message ?? "ReasonAI couldn’t finish this answer. Please try again.");
      lastRequest.current = null;
    } catch (failure) {
      if (active.current !== controller) return;
      const status = failure instanceof ReasonAIStreamResponseError ? failure.status : undefined;
      setError({ auth: status === 401, text: status === 401 ? "Your session has expired. Sign in again to continue." : status === 404 ? "This story is no longer available." : status === 429 ? "ReasonAI is busy. Wait a moment and try again." : controller.signal.aborted ? "Response stopped. You can try again when ready." : "ReasonAI couldn’t finish this answer. Please try again." });
    } finally {
      if (active.current === controller) { active.current = null; setPending(false); }
    }
  }

  return <section aria-label="ReasonAI story conversation" className="flex min-h-0 flex-1 flex-col">
    <div className="mx-3 mt-3 min-w-0 shrink-0 rounded-xl bg-surface-elevated/55 px-4 py-3 sm:mx-5"><p className="mb-1 text-[11px] font-medium text-accent">{storyCategory(story)} · Story attached</p><h3 className="line-clamp-2 break-words text-sm font-medium">{story.title}</h3></div>
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-7">
      {!turns.length && <><p className="mb-5 text-sm leading-6 text-muted">Ask ReasonAI about this story.</p><div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{suggestions.map((question) => <button key={question} type="button" onClick={() => void send(question)} className={`${feedButton} min-w-0 bg-surface text-left text-xs`}>{question}</button>)}</div></>}
      <div role="log" aria-label="Story conversation" aria-live="polite" className="min-w-0 space-y-6 text-sm [overflow-wrap:anywhere]">{turns.map((turn, index) => <article key={index} ref={index === turns.length - 2 ? latest : undefined} className={turn.role === "user" ? "ml-5 rounded-2xl bg-accent/10 px-4 py-3" : ""}>
        <p className="mb-2 text-[10px] uppercase tracking-widest text-muted">{turn.role === "user" ? "You" : "ReasonAI"}</p>
        {turn.role === "assistant" ? <ReasonAIMarkdown text={turn.content} /> : <p className="whitespace-pre-wrap leading-7">{turn.content}</p>}
      </article>)}</div>
      {pending && <p role="status" className="mt-4 flex items-center gap-2 text-xs text-muted"><Sparkles size={14} className="motion-safe:animate-pulse text-accent" />Thinking through your question…</p>}
      {error && <div role="alert" className="mt-4 rounded-xl border border-warning/20 p-4 text-sm"><p>{error.text}</p>{error.auth ? <Link className="mt-2 inline-block text-accent" href={`/login?next=${encodeURIComponent(storyLink(story.id))}`}>Sign in again</Link> : <button type="button" disabled={pending} className={`${feedButton} mt-2 text-accent`} onClick={() => void send(lastRequest.current?.message ?? "", true)}>Try again</button>}</div>}
    </div>
    <div className="shrink-0 p-3 sm:p-5"><ReasonAIComposer draft={draft} onDraftChange={setDraft} pending={pending} onSend={() => void send(draft)} onStop={() => active.current?.abort()} />{!turns.length && <p className="pt-2 text-center text-[10px] text-muted">Answers use this story’s summary.</p>}</div>
  </section>;
}
