"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Newspaper, RefreshCw } from "lucide-react";
import { useAuth } from "@/features/auth";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ApiError } from "@/lib/api/errors";
import { feedErrorMessage } from "./api";
import { storyLink, topicLabel } from "./model";
import { feedKeys, useFeed, useFeedActions } from "./use-feed";
import { feedButton, FeedSkeleton, StoryCard } from "./StoryCard";
import { StoryDetail } from "./StoryDetail";

export function FeedScreen() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="mx-auto max-w-[720px]"><FeedSkeleton /></div>;
  if (!user) return <EmptyState title="Sign in to read your feed" action={<Link href="/login?next=%2Ffeed" className="text-accent">Sign in</Link>} />;
  return <FeedWorkspace key={user.id} userId={user.id} />;
}

function FeedWorkspace({ userId }: { userId: string }) {
  const search = useSearchParams();
  const storyId = search.get("story");
  const [topic, setTopic] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [start, setStart] = useState<string | null>(null);
  const query = useFeed(userId, topic, start);
  const client = useQueryClient();
  const actions = useFeedActions();
  const sentinel = useRef<HTMLDivElement>(null);
  const loading = useRef(false);
  const pages = query.data?.pages ?? [];
  const stories = Array.from(new Map(pages.flatMap((page) => page.items).map((story) => [story.id, story])).values());
  const availableTopics = Array.from(new Set([...topics, ...stories.flatMap((story) => story.topics)])).slice(0, 12);
  const atBufferLimit = pages.length >= 10;

  const loadMore = useCallback(async () => {
    if (loading.current || query.isFetching || !query.hasNextPage || atBufferLimit) return;
    loading.current = true;
    try { await query.fetchNextPage({ cancelRefetch: false }); }
    finally { loading.current = false; }
  }, [query, atBufferLimit]);
  useEffect(() => {
    if (!sentinel.current || query.isError || storyId) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) void loadMore(); }, { rootMargin: "1000px 0px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [loadMore, query.isError, storyId]);

  function refresh() {
    if (query.isFetching) return;
    window.scrollTo({ top: 0, behavior: "instant" });
    if (start) setStart(null);
    else void client.resetQueries({ queryKey: feedKeys.list(userId, topic, start), exact: true });
  }
  function openStory(id: string, ask = false) {
    actions.track(id, ask ? "ASK_REASONAI" : "OPEN");
    window.history.pushState({ feedDetail: true }, "", `${storyLink(id)}${ask ? "&ask=1" : ""}`);
  }
  function closeStory() {
    if (window.history.state?.feedDetail) window.history.back();
    else window.history.replaceState(null, "", "/feed");
  }
  const errorAction = query.error instanceof ApiError && query.error.status === 401
    ? <Link href="/login?next=%2Ffeed" className="text-accent">Sign in again</Link>
    : <button type="button" className={`${feedButton} text-accent`} onClick={query.error instanceof ApiError && query.error.status === 409 ? refresh : () => { if (stories.length) void loadMore(); else void query.refetch(); }}>Try again</button>;

  return <div className="mx-auto max-w-[720px] pb-12">
    <div className="mb-6 flex items-start justify-between gap-4">
      <div><p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-accent">Your daily perspective</p><h1 className="text-3xl font-semibold tracking-tight">Knowledge Feed</h1><p className="mt-2 text-sm leading-6 text-muted">Ideas worth understanding. One story at a time.</p></div>
      <button type="button" onClick={refresh} disabled={query.isFetching} title="Refresh feed" aria-label="Refresh feed" className={`${feedButton} mt-5 border border-border/60 text-muted`}><RefreshCw size={17} className={query.isFetching ? "motion-safe:animate-spin" : ""} /></button>
    </div>
    <div role="group" aria-label="Filter by topic" className="mb-6 flex gap-2 overflow-x-auto pb-2">
      {["", ...availableTopics].map((value) => <button type="button" key={value} aria-pressed={topic === value} onClick={() => { setTopics(availableTopics); setTopic(value); setStart(null); }}
        className={`min-h-10 shrink-0 rounded-full border px-4 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent ${topic === value ? "border-accent/40 bg-accent/15 text-accent" : "border-border/60 text-muted hover:border-accent/40 hover:text-foreground"}`}>{value ? topicLabel(value) : "For You"}</button>)}
    </div>
    {query.isPending ? <FeedSkeleton /> : <div className="space-y-6">
      {stories.map((story) => <StoryCard key={story.id} story={story} actions={actions} onOpen={() => openStory(story.id)} onAsk={() => openStory(story.id, true)} />)}
      {query.isError && <ErrorState title={stories.length ? "Couldn’t load more stories" : "Feed unavailable"} description={feedErrorMessage(query.error)} action={errorAction} />}
      {!query.isError && !stories.length && !query.hasNextPage && <EmptyState title="You’re all caught up" description={topic ? "No recent stories for this topic. Try For You or check back later." : "Fresh stories will appear here when they’re ready. Check back soon."} icon={<Newspaper size={32} className="mx-auto" />} action={<button onClick={refresh} className={`${feedButton} text-accent`}>Refresh feed</button>} />}
      {query.isFetchingNextPage && <FeedSkeleton count={1} />}
      {query.hasNextPage && !query.isError && !query.isFetchingNextPage && <div ref={sentinel} className="py-4 text-center">
        {atBufferLimit ? <><p className="mb-2 text-sm text-muted">Ready for the next set of stories?</p><button className={`${feedButton} text-accent`} onClick={() => { setStart(pages.at(-1)!.nextCursor); window.scrollTo({ top: 0, behavior: "instant" }); }}>Continue reading</button></> : <button onClick={() => void loadMore()} className={`${feedButton} text-muted`}>Load more stories</button>}
      </div>}
      {!!stories.length && !query.hasNextPage && !query.isError && <p className="py-8 text-center text-sm text-muted">You’re all caught up. Come back for a fresh perspective.</p>}
    </div>}
    {storyId && <StoryDetail key={storyId} id={storyId} userId={userId} ask={search.get("ask") === "1"} actions={actions} onClose={closeStory} />}
  </div>;
}
