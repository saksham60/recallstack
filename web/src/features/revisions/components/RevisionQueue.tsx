"use client";

import { useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useDueReviews, useSubmitReview, type DueItem, type ReviewRating } from "../use-revisions";

export function RevisionQueue() {
  const { data: dueData, isLoading, error } = useDueReviews(1, 50);
  const { mutate: submitReview, isPending: isSubmitting, error: submitError } = useSubmitReview();
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight">Revision Queue</h1>
        <div className="space-y-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-32 rounded-xl border border-border bg-surface shadow-sm animate-pulse" />)}</div>
      </div>
    );
  }

  if (error || !dueData) {
    return <ErrorState title="Failed to load due reviews" description={getApiErrorMessage(error, "Please try again later.")} className="max-w-3xl mx-auto" />;
  }

  const pendingReviews = dueData.items.filter((item) => !submittedIds.has(item.card_id));

  const handleRating = (item: DueItem, rating: ReviewRating) => {
    setSubmittedIds((previous) => new Set(previous).add(item.card_id));
    submitReview(
      { cardId: item.card_id, rating, expectedRowVersion: item.row_version },
      {
        onError: () => setSubmittedIds((previous) => {
          const next = new Set(previous);
          next.delete(item.card_id);
          return next;
        }),
      },
    );
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight">Revision Queue</h1><p className="text-muted text-sm mt-1">Spaced repetition for lasting memory.</p></div>
        <span className="text-sm font-medium text-accent bg-accent/10 border border-accent/20 px-3 py-1 rounded-full">{pendingReviews.length} Due</span>
      </div>

      {submitError && <p className="text-sm text-danger" role="alert">{getApiErrorMessage(submitError, "Failed to submit review.")}</p>}

      {pendingReviews.length === 0 ? (
        <EmptyState
          icon="🎉"
          title="You're all caught up!"
          description="No reviews due right now. Great job staying on track."
          action={<Link href="/dsa" className="text-accent hover:underline">Learn something new</Link>}
          className="py-16"
        />
      ) : (
        <div className="space-y-4">
          {pendingReviews.map((item) => (
            <div key={item.card_id} className="flex flex-col rounded-xl border border-border bg-surface p-5 shadow-sm">
              <div className="flex justify-between items-start gap-4 mb-4">
                <div><h3 className="font-semibold tracking-tight text-foreground text-lg">{item.title}</h3><div className="text-sm text-muted mt-1">Due: {new Date(item.due_at).toLocaleString()}</div></div>
                <Link href={`/content/${item.slug}`} className="text-sm font-medium text-accent hover:underline" target="_blank">Review Content ↗</Link>
              </div>
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-sm text-muted mb-3">How well do you remember this?</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button onClick={() => handleRating(item, "again")} disabled={isSubmitting && submittedIds.has(item.card_id)} className="py-2 text-sm font-medium rounded-md bg-danger/10 text-danger hover:bg-danger/20 border border-danger/20 transition-colors disabled:opacity-50">Again (1m)</button>
                  <button onClick={() => handleRating(item, "hard")} disabled={isSubmitting && submittedIds.has(item.card_id)} className="py-2 text-sm font-medium rounded-md bg-warning/10 text-warning hover:bg-warning/20 border border-warning/20 transition-colors disabled:opacity-50">Hard</button>
                  <button onClick={() => handleRating(item, "good")} disabled={isSubmitting && submittedIds.has(item.card_id)} className="py-2 text-sm font-medium rounded-md bg-success/10 text-success hover:bg-success/20 border border-success/20 transition-colors disabled:opacity-50">Good</button>
                  <button onClick={() => handleRating(item, "easy")} disabled={isSubmitting && submittedIds.has(item.card_id)} className="py-2 text-sm font-medium rounded-md bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20 transition-colors disabled:opacity-50">Easy</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
