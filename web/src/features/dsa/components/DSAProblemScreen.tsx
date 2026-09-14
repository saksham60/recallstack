"use client";

import { useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronRight, Code2, Info, PencilLine, Sparkles } from "lucide-react";
import { BookmarkButton } from "@/features/bookmarks";
import { DifficultyBadge } from "@/features/catalog";
import { NotesPanel } from "@/features/notes";
import { useNotes } from "@/features/notes/use-notes";
import { PracticePanel } from "@/features/practice";
import { ErrorState } from "@/components/ui/ErrorState";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useStudyNote, type PublishedStudyNoteResponse } from "@/features/content/use-study-note";
import { getDSAProblemContext } from "../problem";
import { DSATutorPanel } from "../reasonai/DSATutorPanel";
import { useDSATutor } from "../reasonai/use-dsa-tutor";
import { safeExternalUrl, type DSATutorAction } from "../reasonai/contract";

export function DSAProblemScreen({ slug }: { slug: string }) {
  const { data: note, isLoading, error, refetch } = useStudyNote(slug);
  if (isLoading) return <div aria-label="Loading problem" className="animate-pulse space-y-6"><div className="h-20 w-2/3 rounded-xl bg-surface" /><div className="h-96 rounded-2xl bg-surface" /></div>;
  if (error || !note) return <ErrorState title="Unable to load this problem" description={getApiErrorMessage(error, "Please try again.")} action={<button onClick={() => void refetch()} className="text-accent">Try again</button>} />;
  if (note.domain.slug !== "dsa") return <ErrorState title="This content belongs to another workspace" action={<Link href={`/content/${note.slug}`} className="text-accent">Open content</Link>} />;
  return <DSAProblemWorkspace key={note.content_item_id} note={note} />;
}

export function DSAProblemWorkspace({ note }: { note: PublishedStudyNoteResponse }) {
  const [tab, setTab] = useState<"Workspace" | "Notes" | "Similar">("Workspace");
  const [approach, setApproach] = useState("");
  const [code, setCode] = useState("");
  const [editorError, setEditorError] = useState<string>();
  const [tutorOpen, setTutorOpen] = useState(true);
  const [mobileTutor, setMobileTutor] = useState(false);
  const [focused, setFocused] = useState(false);
  const [workspaceWidth, setWorkspaceWidth] = useState(60);
  const split = useRef<HTMLDivElement>(null);
  const { data: notes } = useNotes(note.content_item_id);
  const problem = getDSAProblemContext(note);
  const tutor = useDSATutor({ ...problem, userApproach: approach, userCode: code, userNotes: (notes?.items.map((item) => item.body).join("\n\n") ?? "").slice(0, 12000) });
  function ask(action: DSATutorAction, message: string, web?: boolean) {
    setTutorOpen(true); setMobileTutor(true); tutor.send(action, message, web);
  }
  function review(kind: "approach" | "code") {
    if (!(kind === "approach" ? approach : code).trim()) { setEditorError(`Write your ${kind} first so ReasonAI has something to review.`); return; }
    setEditorError(undefined); ask("review", `Review my ${kind}`);
  }
  const category = note.categories[0];
  const button = "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40";
  return <div className="dsa-workspace">
    <nav inert={focused} aria-hidden={focused} aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-2 text-xs text-muted"><Link href="/dsa" className="hover:text-accent">DSA</Link><ChevronRight size={12} />{category && <><Link href={`/dsa/${category.id}`} className="hover:text-accent">{category.name}</Link><ChevronRight size={12} /></>}<span className="text-foreground/80">{note.title}</span></nav>
    <header inert={focused} aria-hidden={focused} className="mb-7 flex flex-wrap items-center justify-between gap-5">
      <div><h1 className="text-3xl font-semibold tracking-tight">{note.title}</h1><div className="mt-3 flex flex-wrap items-center gap-2">{note.difficulty && <DifficultyBadge difficulty={note.difficulty} />}{note.categories.map((item) => <span key={item.id} className="rounded-full bg-surface-elevated/70 px-2.5 py-1 text-xs text-muted">{item.name}</span>)}{problem.sourceProvider && <span className="ml-1 text-xs text-muted">via {problem.sourceProvider}</span>}</div></div>
      <div className="flex flex-wrap items-center gap-2">{problem.sourceUrl ? <a href={problem.sourceUrl} target="_blank" rel="noopener noreferrer" className={`${button} bg-accent text-accent-foreground hover:bg-accent/90 !px-4 !py-2.5 !text-sm`}>Open {problem.sourceProvider ? `on ${problem.sourceProvider}` : "Problem"}<ArrowUpRight size={16} /></a> : <span className="text-sm text-muted">No practice link available</span>}<BookmarkButton contentId={note.content_item_id} isBookmarked={note.is_bookmarked} />
        {!tutorOpen && <button className={`${button} border border-border text-accent`} onClick={() => { setTutorOpen(true); setMobileTutor(true); }}><Sparkles size={16} />ReasonAI</button>}</div>
    </header>
    <div inert={focused} aria-hidden={focused} className="mb-4 flex gap-2 lg:hidden" aria-label="Workspace view"><button onClick={() => setMobileTutor(false)} aria-pressed={!mobileTutor} className={`${button} ${!mobileTutor ? "bg-surface-elevated" : "text-muted"}`}>Learning workspace</button><button onClick={() => { setMobileTutor(true); setTutorOpen(true); }} aria-pressed={mobileTutor} className={`${button} ${mobileTutor ? "bg-accent/15 text-accent" : "text-muted"}`}><Sparkles size={14} />ReasonAI</button></div>
    <div ref={split} style={{ "--workspace-width": `${workspaceWidth}%` } as CSSProperties} className={`grid items-start gap-5 ${tutorOpen ? "dsa-adjustable-split" : "grid-cols-1"}`}>
      <div inert={focused} aria-hidden={focused} className={`min-w-0 ${mobileTutor ? "hidden lg:block" : ""}`}>
        <div role="tablist" aria-label="Problem workspace" className="mb-6 flex gap-7 border-b border-border/60">{(["Workspace", "Notes", "Similar"] as const).map((item, index, items) => <button key={item} id={`dsa-tab-${item}`} role="tab" aria-selected={tab === item} aria-controls={`dsa-panel-${item}`} tabIndex={tab === item ? 0 : -1} onClick={() => setTab(item)}
          onKeyDown={(event) => { const next = event.key === "ArrowRight" ? items[(index + 1) % items.length] : event.key === "ArrowLeft" ? items[(index + items.length - 1) % items.length] : event.key === "Home" ? items[0] : event.key === "End" ? items[items.length - 1] : undefined; if (next) { event.preventDefault(); setTab(next); document.getElementById(`dsa-tab-${next}`)?.focus(); } }}
          className={`border-b-2 pb-3 text-sm transition-colors ${tab === item ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"}`}>{item}</button>)}</div>
        <div id="dsa-panel-Workspace" role="tabpanel" aria-labelledby="dsa-tab-Workspace" hidden={tab !== "Workspace"}>
          <section className="mb-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><label htmlFor="dsa-approach" className="flex items-center gap-2 text-base font-medium"><PencilLine size={17} className="text-accent" />My approach</label><button disabled={tutor.pending} onClick={() => review("approach")} className={`${button} bg-accent/10 text-accent hover:bg-accent/20`}><Sparkles size={14} />Review with ReasonAI</button></div>
            <p className="mb-4 text-xs leading-5 text-muted">Start with your thinking. An idea, an invariant, or a few lines of pseudocode.</p>
            <textarea id="dsa-approach" value={approach} onChange={(event) => setApproach(event.target.value)} maxLength={12000} placeholder="Write how you would approach this problem..." className="min-h-60 w-full resize-y rounded-xl border border-border/60 bg-surface/40 p-4 text-sm leading-7 outline-none transition-colors placeholder:text-muted/70 focus:border-accent/60" />
            <p className="mt-2 text-[11px] text-muted">Approach and code stay in this workspace until you leave. Save lasting insights in Notes.</p>
          </section>
          <details className="mb-6 rounded-xl border border-border/50 bg-surface/20"><summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-medium"><Code2 size={17} className="text-accent" /><span>My code</span><span className="ml-1 text-xs font-normal text-muted">Optional</span><ChevronRight size={14} className="ml-auto" /></summary><div className="px-4 pb-4"><label htmlFor="dsa-code" className="mb-3 block text-xs text-muted">Paste code in any language for feedback.</label><textarea id="dsa-code" value={code} onChange={(event) => setCode(event.target.value)} maxLength={24000} placeholder="Paste or type your code here..." spellCheck={false} className="min-h-48 w-full resize-y rounded-lg border border-border/50 bg-background/60 p-3 font-mono text-sm leading-6 outline-none focus:border-accent/60" /><div className="mt-3 flex justify-end"><button disabled={tutor.pending} onClick={() => review("code")} className={`${button} bg-accent/10 text-accent`}>Review my code<ArrowUpRight size={14} /></button></div></div></details>
          {editorError && <p role="alert" className="mb-4 text-sm text-warning">{editorError}</p>}
          <details className="border-t border-border/50 py-4"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium"><Info size={16} className="text-muted" />Problem info<ChevronRight size={14} className="ml-auto text-muted" /></summary><div className="pt-4">{problem.summary && <p className="mb-4 text-sm leading-6 text-muted">{problem.summary}</p>}<dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-xs">{problem.sourceUrl && <><dt className="text-muted">Source</dt><dd className="min-w-0"><a href={problem.sourceUrl} target="_blank" rel="noopener noreferrer" className="break-all text-accent">{new URL(problem.sourceUrl).hostname}<span aria-hidden> ↗</span></a></dd></>}{problem.sourceProvider && <><dt className="text-muted">Provider</dt><dd>{problem.sourceProvider}</dd></>}{problem.difficulty && <><dt className="text-muted">Difficulty</dt><dd className="capitalize">{problem.difficulty}</dd></>}{problem.category && <><dt className="text-muted">Category</dt><dd>{problem.category}</dd></>}{!!problem.companies?.length && <><dt className="text-muted">Companies</dt><dd>{problem.companies.join(", ")}</dd></>}{problem.remarks && <><dt className="text-muted">Remarks</dt><dd className="whitespace-pre-wrap">{problem.remarks}</dd></>}</dl></div></details>
          <details className="border-t border-border/50 py-4"><summary className="cursor-pointer text-sm text-muted">Track practice & revision</summary><div className="max-w-md pt-4"><PracticePanel contentId={note.content_item_id} practiceResources={note.practice_resources.filter((item) => safeExternalUrl(item.url))} /></div></details>
        </div>
        <div id="dsa-panel-Notes" role="tabpanel" aria-labelledby="dsa-tab-Notes" hidden={tab !== "Notes"}><p className="mb-4 text-sm text-muted">Keep the insight, the mistake, and what you want to remember next time.</p><NotesPanel contentId={note.content_item_id} /></div>
        <div id="dsa-panel-Similar" role="tabpanel" aria-labelledby="dsa-tab-Similar" hidden={tab !== "Similar"}>
          <h2 className="font-medium">Keep exploring</h2><p className="mt-2 text-sm text-muted">{note.related_content.length ? "Related learning resources from the catalog." : "No related problems have been linked to this entry yet."}</p>
          <div className="mt-4 divide-y divide-border/50">{note.related_content.map((item) => <Link key={item.content_item_id} href={`/content/${item.slug}`} className="flex items-center justify-between gap-3 py-4 text-sm hover:text-accent">{item.title}<ArrowUpRight size={15} /></Link>)}</div>
          <div className="mt-5 flex flex-wrap gap-3">{category && <Link href={`/dsa/${category.id}`} className={`${button} bg-surface-elevated`}>Explore {category.name}</Link>}<button onClick={() => ask("research", "Find related problems and explain what makes them useful practice.", true)} disabled={tutor.pending} className={`${button} bg-accent/10 text-accent`}>Find related problems on the web<ArrowUpRight size={14} /></button></div>
        </div>
      </div>
      {tutorOpen && <div role="separator" aria-label="Resize learning workspace" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={64} aria-valuenow={Math.round(workspaceWidth)} aria-valuetext={`${Math.round(workspaceWidth)} percent workspace`} tabIndex={focused ? -1 : 0} aria-hidden={focused}
        title="Drag to resize · arrow keys to adjust · double-click to reset"
        onDoubleClick={() => setWorkspaceWidth(60)}
        onKeyDown={(event) => { const next = event.key === "ArrowLeft" ? workspaceWidth - 3 : event.key === "ArrowRight" ? workspaceWidth + 3 : event.key === "Home" ? 30 : event.key === "End" ? 64 : undefined; if (next !== undefined) { event.preventDefault(); setWorkspaceWidth(Math.max(30, Math.min(64, next))); } }}
        onPointerDown={(event) => { if (event.button === 0) { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); } }}
        onPointerMove={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId) || !split.current) return; const bounds = split.current.getBoundingClientRect(); setWorkspaceWidth(Math.max(30, Math.min(64, (event.clientX - bounds.left) / bounds.width * 100))); }}
        onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        className="group sticky top-20 hidden h-[calc(100dvh-260px)] min-h-[520px] touch-none cursor-col-resize items-center justify-center rounded-lg outline-none focus-visible:bg-accent/10 lg:flex"><span className="h-14 w-1 rounded-full bg-border/50 transition-colors group-hover:bg-accent group-focus-visible:bg-accent" /></div>}
      <aside className={focused ? "fixed inset-x-0 bottom-0 top-14 z-40 min-w-0 bg-background" : `${tutorOpen ? (mobileTutor ? "block" : "hidden lg:block") : "hidden"} min-w-0 h-[calc(100dvh-340px)] min-h-[440px] lg:sticky lg:top-20 lg:h-[calc(100dvh-260px)] lg:min-h-[520px]`}><DSATutorPanel tutor={tutor} slug={note.slug} problem={{ ...problem, userApproach: approach, userCode: code, userNotes: "" }} focused={focused} onFocusChange={setFocused} onClose={() => { setTutorOpen(false); setMobileTutor(false); }} /></aside>
    </div>
  </div>;
}
