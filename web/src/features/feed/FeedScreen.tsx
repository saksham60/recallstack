"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Newspaper, RefreshCw } from "lucide-react";
import { useAuth } from "@/features/auth";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ApiError } from "@/lib/api/errors";
import { feedApi, feedErrorMessage } from "./api";
import { feedCategories, storyLink } from "./model";
import { feedKeys, useFeed, useFeedActions } from "./use-feed";
import { feedButton, FeedSkeleton, StoryCard } from "./StoryCard";
import { StoryDetail } from "./StoryDetail";

export function FeedScreen() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="mx-auto max-w-[610px]"><FeedSkeleton /></div>;
  if (!user) return <EmptyState title="Sign in to read your feed" action={<Link href="/login?next=%2Ffeed" className="text-accent">Sign in</Link>} />;
  return <FeedWorkspace key={user.id} userId={user.id} />;
}

function FeedWorkspace({ userId }: { userId: string }) {
  const search = useSearchParams();
  const storyId = search.get("story");
  const [topic, setTopic] = useState("");
  const [start, setStart] = useState<string | null>(null);
  const [newStories, setNewStories] = useState(false);
  const query = useFeed(userId, topic, start);
  const client = useQueryClient();
  const actions = useFeedActions(userId);
  const sentinel = useRef<HTMLDivElement>(null);
  const loading = useRef(false);
  const baseline = useRef<{ key: string; newest: number; ids: Set<string> } | null>(null);
  const lastCheck = useRef(0);
  const pages = query.data?.pages ?? [];
  const firstPage = pages[0];
  const stories = Array.from(new Map(pages.flatMap((page) => page.items).map((story) => [story.id, story])).values());
  const sessionKey = `${topic}:${start ?? ""}`;
  const atBufferLimit = pages.length >= 10;

  useEffect(() => {
    if (!firstPage || baseline.current?.key === sessionKey) return;
    baseline.current = {
      key: sessionKey,
      newest: Math.max(0, ...firstPage.items.map((story) => Date.parse(story.publishedAt))),
      ids: new Set(firstPage.items.map((story) => story.id)),
    };
    lastCheck.current = Date.now();
  }, [firstPage, sessionKey]);

  useEffect(() => {
    async function checkFreshness() {
      const current = baseline.current;
      if (!current || current.key !== sessionKey || storyId || query.isFetching || document.visibilityState === "hidden" || Date.now() - lastCheck.current < 300000) return;
      lastCheck.current = Date.now();
      try {
        const latest = await feedApi.list(topic, null);
        if (baseline.current === current && latest.items.some((story) => !current.ids.has(story.id) && Date.parse(story.publishedAt) > current.newest)) setNewStories(true);
      } catch { /* A background check must not interrupt reading. */ }
    }
    window.addEventListener("focus", checkFreshness);
    document.addEventListener("visibilitychange", checkFreshness);
    return () => { window.removeEventListener("focus", checkFreshness); document.removeEventListener("visibilitychange", checkFreshness); };
  }, [query.isFetching, sessionKey, storyId, topic]);

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
    setNewStories(false);
    baseline.current = null;
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

  return <div className="mx-auto max-w-[610px] pb-12">
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0"><h1 className="text-3xl font-semibold tracking-tight">Knowledge Feed</h1><p className="mt-2 text-sm leading-6 text-muted">Ideas worth understanding, one story at a time.</p></div>
      <button type="button" onClick={refresh} disabled={query.isFetching} title="Refresh feed" aria-label="Refresh feed" className={`${feedButton} shrink-0 bg-surface text-muted hover:text-foreground`}><RefreshCw size={17} className={query.isFetching ? "motion-safe:animate-spin" : ""} /><span className="hidden sm:inline">{query.isFetching && !query.isFetchingNextPage ? "Refreshing…" : "Refresh"}</span></button>
    </div>
    <div role="group" aria-label="Filter by category" className="mb-7 flex flex-wrap gap-2">
      {feedCategories.map(({ value, label }) => <button type="button" key={value} aria-pressed={topic === value} onClick={() => { if (topic === value) return; baseline.current = null; setNewStories(false); setTopic(value); setStart(null); }}
        className={`min-h-11 rounded-full px-3.5 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent sm:text-sm ${topic === value ? "bg-accent/15 text-accent" : "bg-surface text-muted hover:bg-surface-elevated hover:text-foreground"}`}>{label}</button>)}
    </div>
    {newStories && <button type="button" onClick={refresh} className="fixed left-1/2 top-17 z-40 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full border border-accent/30 bg-surface px-4 text-sm font-medium text-accent shadow-xl focus-visible:outline-2 focus-visible:outline-accent"><ArrowUp size={16} aria-hidden="true" />New stories</button>}
    {query.isPending ? <FeedSkeleton /> : <div className="space-y-7">
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
