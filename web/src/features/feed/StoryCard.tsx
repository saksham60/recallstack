"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Bookmark, Check, Share2, Sparkles } from "lucide-react";
import { storyAge, storyCategory, type FeedStory } from "./model";
import type { FeedActions } from "./use-feed";

export const feedButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-surface-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50";

export function StoryImage({ story }: { story: FeedStory }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return <div data-testid="story-media" className="relative mx-auto aspect-[4/5] w-full max-w-[480px] overflow-hidden bg-surface-elevated">
    {!failed && story.imageUrl ? <>
      {!loaded && <div aria-hidden="true" className="absolute inset-0 motion-safe:animate-pulse bg-border/30" />}
      <Image src={story.imageUrl} alt={`Illustration for ${story.title}`} fill unoptimized loading="lazy" sizes="(max-width: 480px) 100vw, 480px"
        className={`object-cover transition-opacity motion-reduce:transition-none ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
    </> : <div className="flex h-full flex-col items-center justify-center gap-3 bg-accent/5 px-6 text-center text-sm text-muted">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent/10 text-accent"><Sparkles size={26} aria-hidden="true" /></span>
      <span className="font-medium text-foreground/85">ReasonAI Knowledge</span><span>Image unavailable</span>
    </div>}
  </div>;
}

export function StoryActions({ story, actions, onAsk }: { story: FeedStory; actions: FeedActions; onAsk: () => void }) {
  const saved = story.viewerState.saved;
  const notice = actions.notice?.storyId === story.id ? actions.notice : undefined;
  return <div>
    <div className="flex min-w-0 items-center gap-1 pt-3 sm:gap-2">
      <button type="button" aria-label={saved ? "Saved" : "Save"} aria-pressed={saved} title={saved ? "Remove from saved" : "Save story"} disabled={actions.pending} onClick={() => void actions.toggleSave(story)} className={`${feedButton} min-w-11 ${saved ? "text-accent" : "text-muted"}`}>
        {saved ? <Check size={17} aria-hidden="true" /> : <Bookmark size={17} aria-hidden="true" />}<span className="hidden sm:inline">{saved ? "Saved" : "Save"}</span>
      </button>
      <button type="button" aria-label="Share" onClick={() => void actions.share(story.id, story.title)} className={`${feedButton} min-w-11 text-muted`}><Share2 size={17} aria-hidden="true" /><span className="hidden sm:inline">Share</span></button>
      <button type="button" onClick={onAsk} className={`${feedButton} ml-auto min-w-0 bg-accent/10 px-2.5 text-accent hover:bg-accent/20 sm:px-3`}><Sparkles size={17} aria-hidden="true" /><span className="whitespace-nowrap">Ask ReasonAI</span></button>
    </div>
    <div aria-live="polite" className={`min-h-5 px-2 pt-1 text-xs ${notice?.failed ? "text-warning" : "text-muted"}`}>{notice?.text}</div>
  </div>;
}

export function StoryCard({ story, actions, onOpen, onAsk }: { story: FeedStory; actions: FeedActions; onOpen: () => void; onAsk: () => void }) {
  const card = useRef<HTMLElement>(null);
  const [openedAt] = useState(() => Date.now());
  const { track } = actions;
  useEffect(() => {
    if (!card.current) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      clearTimeout(timer);
      if (entry.isIntersecting) timer = setTimeout(() => { track(story.id, "VIEW"); observer.disconnect(); }, 800);
    }, { threshold: 0.5 });
    observer.observe(card.current);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [story.id, track]);
  return <article ref={card} aria-labelledby={`story-${story.id}`} className="group relative overflow-hidden rounded-2xl border border-border/30 bg-surface shadow-sm transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-lg motion-reduce:transition-none">
    <button type="button" onClick={onOpen} aria-label={`Read ${story.title}`} className="absolute inset-0 z-10 w-full rounded-2xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" />
    <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-3 text-xs sm:px-5">
      <span className="min-w-0 truncate font-medium text-accent">{storyCategory(story)}</span>
      <time dateTime={story.publishedAt} title={new Date(story.publishedAt).toLocaleString()} className="shrink-0 text-muted">{storyAge(story.publishedAt, openedAt)}</time>
    </div>
    <div className="bg-surface-elevated/35"><StoryImage key={story.imageUrl} story={story} /></div>
    <div className="min-w-0 px-4 pb-3 pt-5 sm:px-5">
      <h2 id={`story-${story.id}`} className="break-words text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{story.title}</h2>
      <p className="mt-3 line-clamp-4 whitespace-pre-line break-words text-sm leading-6 text-foreground/85 sm:text-[15px]">{story.summary}</p>
      {story.whyItMatters && <div className="mt-4 border-l-2 border-accent/35 pl-3"><p className="text-xs font-medium text-accent">Why it matters</p><p className="mt-1 line-clamp-2 whitespace-pre-line break-words text-sm leading-6 text-muted">{story.whyItMatters}</p></div>}
      <a href={story.sourceUrl} target="_blank" rel="noopener noreferrer" className="relative z-20 mt-4 inline-flex min-h-10 max-w-full items-center gap-1 text-xs text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent">
        <span className="min-w-0 truncate">{story.source.name}</span><ArrowUpRight size={13} className="shrink-0" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
      </a>
      <div className="relative z-20"><StoryActions story={story} actions={actions} onAsk={onAsk} /></div>
    </div>
  </article>;
}

export function FeedSkeleton({ count = 2 }: { count?: number }) {
  return <div role="status" aria-label="Loading stories" className="space-y-7"><span className="sr-only">Loading stories…</span>{Array.from({ length: count }, (_, index) => <div key={index} aria-hidden="true" className="overflow-hidden rounded-2xl border border-border/30 bg-surface">
    <div className="h-11 px-4 py-4"><div className="h-3 w-24 rounded bg-surface-elevated motion-safe:animate-pulse" /></div>
    <div className="bg-surface-elevated/35"><div className="mx-auto aspect-[4/5] w-full max-w-[480px] bg-surface-elevated motion-safe:animate-pulse" /></div>
    <div className="space-y-4 p-5"><div className="h-6 w-4/5 rounded bg-surface-elevated" /><div className="h-4 rounded bg-surface-elevated" /><div className="h-4 w-5/6 rounded bg-surface-elevated" /><div className="h-10 w-3/4 rounded bg-surface-elevated/70" /><div className="mt-6 h-11 rounded bg-surface-elevated/60" /></div>
  </div>)}</div>;
}
