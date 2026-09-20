"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, Trash2, PanelRightClose, Maximize2, Columns2, ScanLine, Type, ArrowUpRight } from "lucide-react";
import { DSATutorComposer } from "./DSATutorComposer";
import { DSATutorQuickActions } from "./DSATutorQuickActions";
import { DSATutorSources } from "./DSATutorSources";
import { DSATutorMarkdown } from "./DSATutorMarkdown";
import { DSAVisualLesson } from "./DSAVisualLesson";
import type { DSAProblemContext, DSATutorAction } from "./contract";
import type { DSATutor } from "./use-dsa-tutor";
import "./tutor.css";

export function DSATutorPanel({ tutor, onClose, slug, problem, focused, onFocusChange }: {
  tutor: DSATutor; onClose: () => void; slug: string; problem: DSAProblemContext;
  focused: boolean; onFocusChange: (focused: boolean) => void;
}) {
  const conversation = useRef<HTMLDivElement>(null);
  const latest = useRef<HTMLElement>(null);
  const focusButton = useRef<HTMLButtonElement>(null);
  const [largeText, setLargeText] = useState(false);
  const [view, setView] = useState<"lesson" | "conversation">("lesson");
  const [selectedVisualId, setSelectedVisualId] = useState<number>();
  const [visualSteps, setVisualSteps] = useState<Record<number, number>>({});
  const visualMessage = tutor.messages.find((message) => message.id === selectedVisualId && message.response?.visual) ?? [...tutor.messages].reverse().find((message) => message.response?.visual);
  const activeVisual = visualMessage?.response?.visual;
  const showLesson = Boolean(focused && activeVisual && view === "lesson" && !tutor.pending && !tutor.error);
  const { setVisualFocus } = tutor;
  const rememberStep = useCallback((stepNumber: number) => {
    if (visualMessage) setVisualSteps((current) => current[visualMessage.id] === stepNumber ? current : { ...current, [visualMessage.id]: stepNumber });
    if (activeVisual) setVisualFocus({ lessonTitle: activeVisual.title, stepNumber, stepTitle: activeVisual.steps[stepNumber - 1].title });
  }, [visualMessage, activeVisual, setVisualFocus]);
  const lastId = tutor.messages.at(-1)?.id;
  useEffect(() => {
    const area = conversation.current;
    if (!area) return;
    // Open long answers at their beginning; changing width never moves the reader.
    if (latest.current) area.scrollTop += latest.current.getBoundingClientRect().top - area.getBoundingClientRect().top - 24;
    else area.scrollTop = 0;
  }, [lastId]);
  useEffect(() => {
    if (tutor.error && conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [tutor.error]);
  useEffect(() => {
    if (!focused) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    focusButton.current?.focus();
    function escape(event: KeyboardEvent) { if (event.key === "Escape") onFocusChange(false); }
    window.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", escape); };
  }, [focused, onFocusChange]);
  function action(kind: DSATutorAction, message: string) {
    if (kind === "trace" || kind === "visualize") { setSelectedVisualId(undefined); setView("lesson"); onFocusChange(true); }
    tutor.send(kind, message);
  }
  const button = "rounded-lg p-2 text-muted transition-colors hover:bg-surface-elevated hover:text-foreground disabled:opacity-30";
  return <section aria-label="ReasonAI AI Tutor" className={`flex h-full min-h-0 flex-col overflow-hidden border border-border/50 bg-background ${focused ? "rounded-none border-0" : "rounded-2xl"}`}>
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-accent/10 p-2 text-accent"><Sparkles size={20} /></span><div><h2 className="text-base font-semibold tracking-tight">ReasonAI</h2><p className="text-xs text-muted">AI Tutor{focused ? " · Focus view" : ""}</p></div></div>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Larger text" aria-pressed={largeText} title="Larger text" onClick={() => setLargeText(!largeText)} className={`${button} ${largeText ? "!text-accent" : ""}`}><Type size={16} /></button>
        <button type="button" aria-label="Clear chat" title="Clear chat" onClick={tutor.clear} disabled={!tutor.messages.length && !tutor.error} className={button}><Trash2 size={15} /></button>
        <button ref={focusButton} type="button" aria-label={focused ? "Return to split view" : "Focus on tutor"} title={focused ? "Return to split view (Esc)" : "Focus on tutor · hide workspace"} onClick={() => onFocusChange(!focused)} className={`${button} flex items-center gap-2 ${focused ? "bg-accent/10 !text-accent" : ""}`}>{focused ? <Columns2 size={17} /> : <Maximize2 size={17} />}{focused && <span className="text-xs">Workspace</span>}</button>
        {!focused && <button type="button" aria-label="Collapse ReasonAI" title="Collapse ReasonAI" onClick={onClose} className={button}><PanelRightClose size={17} /></button>}
      </div>
    </header>
    <div className="flex items-center justify-between gap-3 border-b border-border/30 bg-surface/30 px-5 py-2 text-xs"><p className="min-w-0 truncate text-muted"><span className="font-medium text-foreground/90">{problem.title}</span>{problem.category && ` · ${problem.category}`}</p>{problem.sourceUrl && <a href={problem.sourceUrl} target="_blank" rel="noopener noreferrer" title={`Open source on ${problem.sourceProvider || "practice platform"}`} className="flex shrink-0 items-center gap-1 text-muted hover:text-accent">{problem.sourceProvider || "Source"}<ArrowUpRight size={13} /></a>}</div>
    {focused && activeVisual && <div className="flex shrink-0 items-center justify-center gap-1 border-b border-border/30 py-2" aria-label="Tutor view"><button type="button" aria-pressed={showLesson} onClick={() => setView("lesson")} className={`rounded-lg px-4 py-1.5 text-xs ${showLesson ? "bg-accent/10 text-accent" : "text-muted"}`}>Walkthrough</button><button type="button" aria-pressed={!showLesson} onClick={() => setView("conversation")} className={`rounded-lg px-4 py-1.5 text-xs ${!showLesson ? "bg-accent/10 text-accent" : "text-muted"}`}>Conversation</button></div>}
    {focused && activeVisual && <div className={`${showLesson ? "flex" : "hidden"} min-h-0 flex-1 flex-col px-3 pt-3 sm:px-6`}><div className="mx-auto min-h-0 w-full max-w-5xl flex-1"><DSAVisualLesson key={visualMessage!.id} lesson={activeVisual} stage active={showLesson} initialStepNumber={visualSteps[visualMessage!.id]} largeText={largeText} onStepChange={rememberStep} /></div><div className="mx-auto flex w-full max-w-5xl shrink-0 flex-wrap items-center justify-between gap-2 py-3"><span className="text-[11px] text-muted">{visualMessage?.response?.sources.length ? "Source links in Conversation" : "An example to reason through, one step at a time."}</span><button type="button" onClick={() => { setView("conversation"); requestAnimationFrame(() => conversation.current?.closest("section")?.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ask ReasonAI"]')?.focus()); }} className="rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent">Ask about this step →</button></div></div>}
    <div ref={conversation} data-testid="tutor-scroll" className={`${showLesson ? "hidden" : ""} min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-6`}>
      <div className={`mx-auto w-full ${focused ? "max-w-4xl" : ""}`}>
        {!tutor.messages.length ? <>
          <div className="mb-6 text-sm leading-7"><p className="mb-3 font-medium">Hi! I&apos;m ReasonAI 👋</p><p className="text-muted">I can help you think through this problem without jumping straight to the answer.</p><p className="mt-3 text-muted">What would you like help with?</p></div>
          <DSATutorQuickActions onAction={action} disabled={tutor.pending} />
        </> : <details className="mb-5"><summary className="cursor-pointer text-xs text-muted hover:text-accent">Learning actions</summary><div className="pt-3"><DSATutorQuickActions onAction={action} disabled={tutor.pending} /></div></details>}
        <div role="log" aria-label="Tutor conversation" aria-live="polite" className={`space-y-7 ${largeText ? "text-base" : "text-sm"}`}>
          {tutor.messages.map((message, index) => <article key={message.id} ref={index === tutor.messages.length - 1 ? latest : undefined} className={message.role === "user" ? "ml-6 rounded-2xl rounded-tr-sm bg-accent/10 px-4 py-3" : "text-foreground/90"}>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted">{message.role === "user" ? "You" : "ReasonAI"}</p>
            {message.role === "user" ? <p className="whitespace-pre-wrap break-words leading-7">{message.content}</p> : <>
              {message.tools?.map((tool) => <div key={tool.toolCallId} className="mb-2 text-xs text-muted">
                {tool.toolName === "search_web" ? "\u{1F50E} " : tool.toolName === "create_visual" ? "◈ " : "• "}
                {tool.summary}
              </div>)}
              <DSATutorMarkdown text={message.content} />
            </>}
            {message.response?.visual && (focused ? <button type="button" onClick={() => { setSelectedVisualId(message.id); setView("lesson"); }} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent"><ScanLine size={14} />View walkthrough</button> : <DSAVisualLesson lesson={message.response.visual} onExpand={() => { setSelectedVisualId(message.id); setView("lesson"); onFocusChange(true); }} />)}
            {message.response?.notice && <p className="mt-3 text-xs leading-5 text-warning">{message.response.notice}</p>}
            {(message.response?.webStatus === "used" || message.response?.webStatus === "cached") && <DSATutorSources sources={message.response.sources} cached={message.response.webStatus === "cached"} />}
          </article>)}
        </div>
        {tutor.pending && <p role="status" className="mt-5 flex items-center gap-2 text-xs text-muted"><Sparkles size={14} className="animate-pulse text-accent" />{tutor.activity ?? "Thinking through your question…"}</p>}
        {tutor.error && <div role="alert" className="mt-4 rounded-lg bg-danger/5 p-3 text-sm"><p>{tutor.error}</p>{tutor.authExpired
          ? <Link href={`/login?next=${encodeURIComponent(`/dsa/problem/${slug}`)}`} className="mt-2 inline-block text-accent">Sign in again</Link>
          : tutor.canRetry && <button type="button" onClick={tutor.retry} disabled={tutor.pending} className="mt-2 text-accent">Try again</button>}</div>}
      </div>
    </div>
    <div className={`${showLesson ? "hidden" : ""} mx-auto w-full px-3 pb-3 ${focused ? "max-w-[944px] sm:px-6" : ""}`}>
      {focused && tutor.visualFocus && <p className="truncate px-3 pb-1 text-[11px] text-muted">Discussing step {tutor.visualFocus.stepNumber}: {tutor.visualFocus.stepTitle}</p>}
      <div className="flex items-center gap-3 px-1 pb-2"><button type="button" disabled={tutor.pending} onClick={() => action("visualize", "Help me understand this visually with a short step-by-step walkthrough. Keep it at my current level of progress; do not reveal the full solution.")} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-accent hover:bg-accent/10 disabled:opacity-40"><ScanLine size={14} />Visual walkthrough</button></div>
      <DSATutorComposer tutor={tutor} /><p className="px-2 pt-2 text-center text-[10px] text-muted">{focused ? "Take one step at a time. Your workspace stays here while you focus." : "Open the linked problem. Think it through here."}</p>
    </div>
  </section>;
}
