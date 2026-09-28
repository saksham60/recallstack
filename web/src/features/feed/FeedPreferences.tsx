"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { feedApi, feedErrorMessage } from "./api";
import { feedCategories } from "./model";
import { feedButton } from "./StoryCard";

const interests = feedCategories.filter((category) => category.value !== "");
const interestKeys = new Set<string>(interests.map((category) => category.value));

export function FeedPreferences({ userId, onSaved }: { userId: string; onSaved: () => Promise<void> }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const preferences = useQuery({
    queryKey: ["feed-preferences", userId],
    queryFn: ({ signal }) => feedApi.preferences(signal),
    enabled: open,
    staleTime: 60_000,
  });

  const selected = draft ?? preferences.data?.topics.filter((item) => !item.blocked && interestKeys.has(item.topic)).map((item) => item.topic) ?? [];

  async function save() {
    if (!preferences.data || saving) return;
    setSaving(true);
    setError("");
    try {
      const topics = [
        ...preferences.data.topics.filter((item) => !interestKeys.has(item.topic) || (item.blocked && !selected.includes(item.topic))),
        ...selected.map((topic) => ({ topic, weight: 2, blocked: false })),
      ];
      const updated = await feedApi.savePreferences(topics);
      client.setQueryData(["feed-preferences", userId], updated);
      setOpen(false);
      setDraft(null);
      await onSaved();
    } catch (cause) {
      setError(feedErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return <div className="mb-4">
    <button type="button" aria-expanded={open} aria-controls="feed-interests" onClick={() => { setError(""); setDraft(null); setOpen((current) => !current); }} className={`${feedButton} text-accent`}>
      <SlidersHorizontal size={16} aria-hidden="true" /> Customize your feed
    </button>
    {open && <section id="feed-interests" aria-label="Your interests" className="mt-2 rounded-2xl border border-border/50 bg-surface p-4 sm:p-5">
      <h2 className="font-semibold">What would you like to see more of?</h2>
      <p className="mt-1 text-sm text-muted">Choose any interests. Your For You feed will put matching stories higher.</p>
      {preferences.isPending ? <p role="status" className="mt-4 text-sm text-muted">Loading your interests…</p> : preferences.isError ? <div role="alert" className="mt-4 text-sm text-warning">{feedErrorMessage(preferences.error)} <button type="button" className="text-accent" onClick={() => void preferences.refetch()}>Try again</button></div> : <>
        <div role="group" aria-label="Preferred categories" className="mt-4 flex flex-wrap gap-2">
          {interests.map(({ value, label }) => <button type="button" key={value} aria-pressed={selected.includes(value)} disabled={saving} onClick={() => setDraft((current) => (current ?? selected).includes(value) ? (current ?? selected).filter((item) => item !== value) : [...(current ?? selected), value])}
            className={`min-h-11 rounded-full px-3.5 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent ${selected.includes(value) ? "bg-accent/15 text-accent" : "bg-surface-elevated text-muted hover:text-foreground"}`}>{label}</button>)}
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-warning">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => { setOpen(false); setDraft(null); }} disabled={saving} className={`${feedButton} text-muted`}>Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving} className={`${feedButton} bg-accent/15 text-accent`}>{saving ? "Saving…" : "Save interests"}</button>
        </div>
      </>}
    </section>}
  </div>;
}
