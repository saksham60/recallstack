"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Sparkles, Trash2, PanelRightClose } from "lucide-react";
import { DSATutorComposer } from "./DSATutorComposer";
import { DSATutorQuickActions } from "./DSATutorQuickActions";
import { DSATutorSources } from "./DSATutorSources";
import type { DSATutor } from "./use-dsa-tutor";

function TutorText({ text }: { text: string }) {
  // React escapes all provider text. Only fenced code receives special layout.
  return <>{text.split(/(```[\s\S]*?```)/g).map((part, index) => part.startsWith("```")
    ? <pre key={index} className="my-3 max-w-full overflow-x-auto rounded-lg bg-background p-3 text-xs"><code>{part.replace(/^```[^\n]*\n?/, "").replace(/```$/, "")}</code></pre>
    : <span key={index} className="whitespace-pre-wrap break-words">{part}</span>)}</>;
}
export function DSATutorPanel({ tutor, onClose, slug }: { tutor: DSATutor; onClose: () => void; slug: string }) {
  const conversation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [tutor.messages, tutor.pending, tutor.error]);
  return <section aria-label="ReasonAI AI Tutor" className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/50 bg-surface/50">
    <header className="flex items-center justify-between border-b border-border/50 px-5 py-4">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-accent/10 p-2 text-accent"><Sparkles size={20} /></span><div><h2 className="text-base font-semibold tracking-tight">ReasonAI</h2><p className="text-xs text-muted">AI Tutor</p></div></div>
      <div className="flex gap-1"><button type="button" aria-label="Clear chat" title="Clear chat" onClick={tutor.clear} disabled={!tutor.messages.length && !tutor.error} className="rounded-lg p-2 text-muted hover:bg-surface-elevated disabled:opacity-30"><Trash2 size={15} /></button>
        <button type="button" aria-label="Collapse ReasonAI" title="Collapse ReasonAI" onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-surface-elevated"><PanelRightClose size={17} /></button></div>
    </header>
    <div ref={conversation} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6">
      <div className="mb-6 text-sm leading-6"><p className="mb-3 font-medium">Hi! I&apos;m ReasonAI 👋</p><p className="text-muted">I can help you think through this problem without jumping straight to the answer.</p><p className="mt-3 text-muted">What would you like help with?</p></div>
      <DSATutorQuickActions onAction={tutor.send} disabled={tutor.pending} />
      <div role="log" aria-label="Tutor conversation" aria-live="polite" className="mt-7 space-y-6">
        {tutor.messages.map((message) => <article key={message.id} className={message.role === "user" ? "ml-6 rounded-2xl rounded-tr-sm bg-accent/10 px-4 py-3" : "text-foreground/90"}>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted">{message.role === "user" ? "You" : "ReasonAI"}</p>
          <div className="min-w-0 text-sm leading-6"><TutorText text={message.content} /></div>
          {message.response?.notice && <p className="mt-3 text-xs leading-5 text-warning">{message.response.notice}</p>}
          {message.response?.webStatus === "used" && <DSATutorSources sources={message.response.sources} />}
        </article>)}
      </div>
      {tutor.pending && <p role="status" className="mt-5 flex items-center gap-2 text-xs text-muted"><Sparkles size={14} className="animate-pulse text-accent" />Thinking through your question…</p>}
      {tutor.error && <div role="alert" className="mt-4 rounded-lg bg-danger/5 p-3 text-sm"><p>{tutor.error}</p>{tutor.authExpired
        ? <Link href={`/login?next=${encodeURIComponent(`/dsa/problem/${slug}`)}`} className="mt-2 inline-block text-accent">Sign in again</Link>
        : tutor.canRetry && <button type="button" onClick={tutor.retry} disabled={tutor.pending} className="mt-2 text-accent">Try again</button>}</div>}
    </div>
    <div className="p-3 pt-0"><DSATutorComposer tutor={tutor} /><p className="px-2 pt-2 text-center text-[10px] text-muted">Think it through. Test your ideas on the original platform.</p></div>
  </section>;
}
