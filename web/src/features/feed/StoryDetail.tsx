"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import { ApiError } from "@/lib/api/errors";
import { ErrorState } from "@/components/ui/ErrorState";
import { feedErrorMessage } from "./api";
import { storyLink, topicLabel } from "./model";
import { useFeedStory, type FeedActions } from "./use-feed";
import { feedButton, FeedSkeleton, StoryActions, StoryImage } from "./StoryCard";

const StoryChat = dynamic(() => import("./StoryChat").then((module) => module.StoryChat), { loading: () => <p role="status" className="p-6 text-sm text-muted">Opening ReasonAI…</p> });

export function StoryDetail({ id, userId, ask, actions, onClose }: { id: string; userId: string; ask: boolean; actions: FeedActions; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [chat, setChat] = useState(ask);
  const [chatOpened, setChatOpened] = useState(ask);
  const story = useFeedStory(userId, id);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; previousFocus?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} aria-labelledby="story-detail-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === dialog.current) onClose(); }}
    className="fixed inset-0 m-auto h-[min(92dvh,1000px)] max-h-none w-[min(760px,calc(100%-24px))] max-w-none overflow-hidden rounded-2xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm">
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
        <h2 id="story-detail-title" className="text-sm font-medium">{chat ? "Ask ReasonAI" : "Story details"}</h2>
        <div className="flex items-center gap-2">{chat && <button type="button" onClick={() => setChat(false)} className={`${feedButton} text-muted`}>Back to story</button>}
          <button type="button" onClick={onClose} aria-label="Close story" title="Close (Esc)" className={feedButton}><X size={20} /></button></div>
      </header>
      {story.isPending ? <div className="overflow-y-auto p-4"><FeedSkeleton count={1} /></div> : story.isError ? <div className="p-5"><ErrorState title="Story unavailable" description={feedErrorMessage(story.error)} action={story.error instanceof ApiError && story.error.status === 401 ? <Link href={`/login?next=${encodeURIComponent(storyLink(id))}`} className="text-accent">Sign in again</Link> : <button className={feedButton} onClick={() => void story.refetch()}>Try again</button>} /></div> : <>
      {chatOpened && <div className={`${chat ? "flex" : "hidden"} min-h-0 flex-1 flex-col`}><StoryChat story={story.data} /></div>}
      <div className={`${chat ? "hidden" : ""} min-h-0 flex-1 overflow-y-auto overscroll-contain`}>
        <StoryImage key={story.data.imageUrl} story={story.data} />
        <div className="space-y-5 p-5 sm:p-7">
          <div className="flex flex-wrap gap-2 text-xs text-accent">{story.data.topics.map((topic) => <span key={topic}>{topicLabel(topic)}</span>)}</div>
          <h3 className="text-2xl font-semibold leading-snug tracking-tight">{story.data.title}</h3>
          <p className="whitespace-pre-line text-base leading-8 text-foreground/85">{story.data.summary}</p>
          {story.data.whyItMatters && <section className="rounded-xl border border-accent/20 bg-accent/5 p-5"><h4 className="mb-2 text-sm font-medium text-accent">Why it matters</h4><p className="whitespace-pre-line text-sm leading-7">{story.data.whyItMatters}</p></section>}
          <a href={story.data.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent">Read the source · {story.data.source.name}<ArrowUpRight size={16} /><span className="sr-only"> (opens in a new tab)</span></a>
          <StoryActions story={story.data} actions={actions} onAsk={() => { actions.track(id, "ASK_REASONAI"); setChatOpened(true); setChat(true); }} />
        </div>
      </div></>}
    </div>
  </dialog>;
}
