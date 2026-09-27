"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Bookmark, Check, ImageOff, Share2, Sparkles } from "lucide-react";
import { topicLabel, type FeedStory } from "./model";
import type { FeedActions } from "./use-feed";

export const feedButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-surface-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50";

export function StoryImage({ story }: { story: FeedStory }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return <div className="relative aspect-video overflow-hidden bg-surface-elevated">
    {!failed && story.imageUrl ? <>
      {!loaded && <div aria-hidden="true" className="absolute inset-0 motion-safe:animate-pulse bg-border/30" />}
      <Image src={story.imageUrl} alt={`Illustration for ${story.title}`} fill unoptimized loading="lazy" sizes="(max-width: 768px) 100vw, 720px"
        className={`object-cover transition-opacity motion-reduce:transition-none ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
    </> : <div className="flex h-full items-center justify-center gap-2 text-sm text-muted"><ImageOff size={20} aria-hidden="true" />Image unavailable</div>}
  </div>;
}

export function StoryActions({ story, actions, onAsk }: { story: FeedStory; actions: FeedActions; onAsk: () => void }) {
  const saved = story.viewerState.saved;
  const notice = actions.notice?.storyId === story.id ? actions.notice : undefined;
  return <div>
    <div className="flex flex-wrap items-center gap-1 border-t border-border/50 pt-3">
      <button type="button" aria-pressed={saved} title={saved ? "Remove from saved" : "Save story"} disabled={actions.pending} onClick={() => void actions.toggleSave(story)} className={`${feedButton} ${saved ? "text-accent" : "text-muted"}`}>
        {saved ? <Check size={17} aria-hidden="true" /> : <Bookmark size={17} aria-hidden="true" />}{saved ? "Saved" : "Save"}
      </button>
      <button type="button" onClick={() => void actions.share(story.id, story.title)} className={`${feedButton} text-muted`}><Share2 size={17} aria-hidden="true" />Share</button>
      <button type="button" onClick={onAsk} className={`${feedButton} ml-auto bg-accent/10 text-accent hover:bg-accent/20`}><Sparkles size={17} aria-hidden="true" />Ask ReasonAI</button>
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
  const age = Math.max(0, openedAt - Date.parse(story.publishedAt));
  const time = age < 3600000 ? `${Math.max(1, Math.floor(age / 60000))}m ago` : age < 86400000 ? `${Math.floor(age / 3600000)}h ago` : `${Math.floor(age / 86400000)}d ago`;
  return <article ref={card} aria-labelledby={`story-${story.id}`} className="overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-sm">
    <div className="flex items-center justify-between gap-3 px-5 py-3 text-xs sm:px-6">
      <span className="truncate font-medium text-accent">{story.topics[0] ? topicLabel(story.topics[0]) : "Knowledge"}</span>
      <time dateTime={story.publishedAt} title={new Date(story.publishedAt).toLocaleString()} className="shrink-0 text-muted">{time}</time>
    </div>
    <button type="button" onClick={onOpen} aria-label={`Read ${story.title}`} className="block w-full text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"><StoryImage key={story.imageUrl} story={story} /></button>
    <div className="px-5 pb-3 pt-5 sm:px-6">
      <h2 id={`story-${story.id}`} className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl"><button type="button" onClick={onOpen} className="text-left hover:text-accent focus-visible:outline-accent">{story.title}</button></h2>
      <p className="mt-3 line-clamp-6 whitespace-pre-line text-sm leading-7 text-foreground/80 sm:text-base">{story.summary}</p>
      <div className="mt-4 flex flex-wrap gap-2">{story.topics.slice(0, 4).map((topic) => <span key={topic} className="rounded-md bg-surface-elevated/70 px-2 py-1 text-[11px] text-muted">{topicLabel(topic)}</span>)}</div>
      <div className="my-3 flex items-center justify-between gap-3 text-xs">
        <a href={story.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 text-muted hover:text-accent">{story.source.name}<ArrowUpRight size={13} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
        <button type="button" onClick={onOpen} className="min-h-10 text-accent hover:underline">Read more</button>
      </div>
      <StoryActions story={story} actions={actions} onAsk={onAsk} />
    </div>
  </article>;
}

export function FeedSkeleton({ count = 2 }: { count?: number }) {
  return <div role="status" aria-label="Loading stories" className="space-y-6"><span className="sr-only">Loading stories…</span>{Array.from({ length: count }, (_, index) => <div key={index} aria-hidden="true" className="overflow-hidden rounded-2xl border border-border/60 bg-surface">
    <div className="h-12 px-5 py-4"><div className="h-3 w-24 rounded bg-surface-elevated motion-safe:animate-pulse" /></div>
    <div className="aspect-video bg-surface-elevated motion-safe:animate-pulse" />
    <div className="space-y-4 p-6"><div className="h-6 w-4/5 rounded bg-surface-elevated" /><div className="h-4 rounded bg-surface-elevated" /><div className="h-4 w-5/6 rounded bg-surface-elevated" /><div className="mt-6 h-10 rounded bg-surface-elevated/60" /></div>
  </div>)}</div>;
}
