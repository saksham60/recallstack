"use client";

import Link from "next/link";
import { BookmarkCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useAuth } from "@/features/auth";
import { feedErrorMessage } from "@/features/feed/api";
import { storyLink } from "@/features/feed/model";
import { useFeedActions, useSavedStories } from "@/features/feed/use-feed";

const button = "rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-elevated focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50";

export function SavedStories() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p role="status">Loading saved stories…</p>;
  if (!user) return <Link href="/login?next=%2Fbookmarks" className="text-accent hover:underline">Sign in to see your saved stories</Link>;
  return <UserSavedStories key={user.id} userId={user.id} />;
}

function UserSavedStories({ userId }: { userId: string }) {
  const query = useSavedStories(userId);
  const actions = useFeedActions(userId);
  const stories = [...new Map(query.data?.pages.flatMap((page) => page.items).map((story) => [story.id, story])).values()];

  if (query.isPending) return <p role="status">Loading saved stories…</p>;
  if (!query.data) return <ErrorState title="Couldn't load saved stories" description={feedErrorMessage(query.error)} action={<button className={button} onClick={() => void query.refetch()}>Retry saved stories</button>} />;

  return (
    <div className="space-y-4">
      {actions.notice && <p role={actions.notice.failed ? "alert" : "status"} className={actions.notice.failed ? "text-sm text-danger" : "text-sm text-muted"}>{actions.notice.text}</p>}
      {stories.length === 0 ? (
        <EmptyState title="No saved stories yet." description="Save a story in your Knowledge Feed to find it here." action={<Link href="/feed" className="text-accent hover:underline">Explore the feed</Link>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {stories.map((story) => (
            <article key={story.id} className="flex min-w-0 flex-col rounded-xl border border-border bg-surface p-5 shadow-sm">
              <p className="mb-2 text-xs text-muted">{story.source.name} · {new Date(story.publishedAt).toLocaleDateString()}</p>
              <h3 className="font-semibold tracking-tight"><Link href={storyLink(story.id)} className="break-words hover:text-accent">{story.title}</Link></h3>
              <p className="mt-2 line-clamp-3 text-sm text-muted">{story.summary}</p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                <Link href={storyLink(story.id)} className="text-sm font-medium text-accent hover:underline">Read story</Link>
                <button className={button} aria-label={`Unsave ${story.title}`} disabled={actions.pending} onClick={() => void actions.toggleSave(story)}><BookmarkCheck size={16} aria-hidden="true" className="mr-1 inline" />Unsave</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {query.isError && <ErrorState title="Couldn't refresh saved stories" description={feedErrorMessage(query.error)} action={<button className={button} onClick={() => void query.refetch()}>Retry saved stories</button>} />}
      {query.hasNextPage && !query.isFetchNextPageError && <button className={button} disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "Loading saved stories…" : "Load more saved stories"}</button>}
    </div>
  );
}
