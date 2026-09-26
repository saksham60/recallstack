"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { feedApi, feedErrorMessage, retryFeedRequest } from "./api";
import type { FeedEvent } from "./model";

export const feedKeys = {
  list: (userId: string, topic: string, start: string | null) => ["feed", userId, topic, start] as const,
  story: (userId: string, id: string) => ["feed-story", userId, id] as const,
};

export function useFeed(userId: string, topic: string, start: string | null) {
  return useInfiniteQuery({
    queryKey: feedKeys.list(userId, topic, start),
    queryFn: ({ pageParam, signal }) => feedApi.list(topic, pageParam, signal),
    initialPageParam: start,
    getNextPageParam: (page, _pages, lastCursor, cursors) => page.hasMore && page.nextCursor !== lastCursor && !cursors.includes(page.nextCursor) ? page.nextCursor : undefined,
    enabled: Boolean(userId), retry: retryFeedRequest,
    staleTime: Infinity, gcTime: 0, refetchOnReconnect: false,
  });
}

export function useFeedStory(userId: string, id: string) {
  return useQuery({
    queryKey: feedKeys.story(userId, id),
    queryFn: ({ signal }) => feedApi.story(id, signal),
    enabled: Boolean(userId), retry: retryFeedRequest, gcTime: 0,
  });
}

function event(storyId: string, type: FeedEvent["type"]): FeedEvent {
  return { eventId: crypto.randomUUID(), storyId, type, occurredAt: new Date().toISOString() };
}

/** Analytics are best-effort; Save waits for durable API acknowledgement. */
export function useFeedActions() {
  const queue = useRef<FeedEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const viewed = useRef(new Set<string>());
  const saving = useRef(false);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<{ storyId: string; text: string; failed?: boolean }>();
  const mutation = useMutation({ mutationFn: (item: FeedEvent) => feedApi.events([item]), retry: retryFeedRequest });
  const track = useCallback((id: string, type: FeedEvent["type"]) => {
    if (type === "VIEW") {
      if (viewed.current.has(id)) return;
      viewed.current.add(id);
      if (viewed.current.size > 100) viewed.current.delete(viewed.current.values().next().value!);
    }
    if (queue.current.length < 100) queue.current.push(event(id, type));
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = undefined;
      const batch = queue.current.splice(0, 100);
      void feedApi.events(batch).catch(() => { /* Analytics must not interrupt reading. */ });
    }, 750);
  }, []);
  useEffect(() => () => { clearTimeout(timer.current); queue.current = []; }, []);

  async function toggleSave(id: string) {
    if (saving.current) return;
    saving.current = true;
    setNotice(undefined);
    const next = !saved[id];
    try {
      // TODO(API): hydrate saved state once StoryResponse exposes the user projection.
      await mutation.mutateAsync(event(id, next ? "SAVE" : "UNSAVE"));
      setSaved((current) => Object.fromEntries([...Object.entries(current).filter(([key]) => key !== id).slice(-99), [id, next]]));
      setNotice({ storyId: id, text: next ? "Story saved" : "Story removed from saved" });
    } catch (error) { setNotice({ storyId: id, text: feedErrorMessage(error), failed: true }); }
    finally { saving.current = false; }
  }

  async function share(id: string, title: string) {
    const url = `${window.location.origin}/feed?story=${encodeURIComponent(id)}`;
    const nativeShare = typeof navigator.share === "function";
    try {
      if (nativeShare) await navigator.share({ title, url });
      else await navigator.clipboard.writeText(url);
      setNotice({ storyId: id, text: nativeShare ? "Story shared" : "Link copied" });
      track(id, "SHARE");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setNotice({ storyId: id, text: "Couldn’t share this story. Open its details and copy the address.", failed: true });
    }
  }

  return { saved, notice, pending: mutation.isPending, toggleSave, share, track };
}

export type FeedActions = ReturnType<typeof useFeedActions>;
