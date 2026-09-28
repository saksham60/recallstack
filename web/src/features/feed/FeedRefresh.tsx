"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { feedApi, feedErrorMessage } from "./api";
import { feedButton } from "./StoryCard";

type RefreshRun = Awaited<ReturnType<typeof feedApi.startRefresh>>;

export function FeedRefresh({ visible, onCompleted }: { visible: boolean; onCompleted: () => void }) {
  const availability = useQuery({ queryKey: ["knowledge-refresh-availability"], queryFn: ({ signal }) => feedApi.refreshAvailability(signal), enabled: visible, staleTime: 5 * 60_000, retry: false });
  const [run, setRun] = useState<RefreshRun>();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const completed = useRef(onCompleted);
  const active = run?.status === "starting" || run?.status === "running";
  const runId = run?.runId;
  const cooling = Boolean(run && !active && Date.parse(run.nextAllowedAt) > now);

  useEffect(() => { completed.current = onCompleted; }, [onCompleted]);
  useEffect(() => {
    if (!cooling) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [cooling]);

  useEffect(() => {
    if (!runId || !active) return;
    let pending = false;
    let stopped = false;
    const timer = window.setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        const latest = await feedApi.refreshStatus(runId);
        if (stopped) return;
        setRun(latest);
        setError("");
        if (latest.status === "succeeded") completed.current();
      } catch (cause) {
        if (!stopped) setError(feedErrorMessage(cause));
      } finally {
        pending = false;
      }
    }, 10_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [runId, active]);

  async function start() {
    if (starting || active || cooling) return;
    setStarting(true);
    setError("");
    try {
      setRun(await feedApi.startRefresh());
      setNow(Date.now());
    } catch (cause) {
      setError(feedErrorMessage(cause));
    } finally {
      setStarting(false);
    }
  }

  if (!availability.data) return null;
  return <div className={`${visible ? "" : "hidden"} rounded-2xl border border-border/40 bg-surface p-5 text-center`}>
    <Sparkles size={22} aria-hidden="true" className="mx-auto text-accent" />
    <h2 className="mt-2 font-semibold">Want more to explore?</h2>
    <p className="mt-1 text-sm text-muted">Look for new stories. This can take a few minutes, and new stories are shared with everyone.</p>
    <button type="button" onClick={() => void start()} disabled={starting || active || cooling} className={`${feedButton} mt-3 bg-accent/15 text-accent`}>
      {starting ? "Starting…" : active ? "Finding stories…" : cooling ? "Available soon" : "Find new stories"}
    </button>
    {active && <p role="status" className="mt-3 text-sm text-muted">Finding and preparing stories. Checking progress every 10 seconds.</p>}
    {run?.status === "succeeded" && <p role="status" className="mt-3 text-sm text-muted">The search finished. Your feed has been checked for new stories.</p>}
    {run?.status === "failed" && <p role="status" className="mt-3 text-sm text-muted">The search could not finish. Please try again later.</p>}
    {run && !active && <p className="mt-1 text-xs text-muted">Next search available after {new Date(run.nextAllowedAt).toLocaleTimeString()}.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-warning">{error}</p>}
  </div>;
}
