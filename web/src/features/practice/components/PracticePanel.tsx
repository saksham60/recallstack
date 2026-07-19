"use client";

import React, { useState } from "react";
import { useSubmitPractice } from "../use-practice";

interface PracticePanelProps {
  contentId: string;
}

export function PracticePanel({ contentId }: PracticePanelProps) {
  const { mutate, isPending } = useSubmitPractice();
  const [isOpen, setIsOpen] = useState(false);
  
  const [outcome, setOutcome] = useState<
    "solved_independently" | "solved_with_hint" | "understood_but_could_not_code" | "pattern_not_identified" | "skipped"
  >("solved_independently");
  const [hintUsed, setHintUsed] = useState(false);
  const [durationStr, setDurationStr] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Generate a random UUID for attempt_event_id 
    const attemptEventId = crypto.randomUUID();
    
    mutate({
      attempt_event_id: attemptEventId,
      content_item_id: contentId,
      outcome,
      hint_used: hintUsed,
      duration_seconds: durationStr ? parseInt(durationStr, 10) : undefined,
      attempted_at: new Date().toISOString(),
    }, {
      onSuccess: () => {
        setIsOpen(false);
      }
    });
  };

  if (!isOpen) {
    return (
      <div className="flex flex-col gap-2">
        <a 
          href="https://leetcode.com/problemset/all/" 
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-2 bg-accent text-accent-foreground rounded-md font-medium text-center hover:bg-accent/90 transition-colors block"
        >
          Start Practice
        </a>
        <button 
          onClick={() => setIsOpen(true)}
          className="w-full py-2 bg-surface-elevated text-foreground border border-border rounded-md font-medium hover:border-accent transition-colors"
        >
          Update Progress
        </button>
      </div>
    );
  }

  return (
    <div className="bg-surface-elevated border border-border rounded-lg p-4 mt-2">
      <h4 className="font-semibold text-sm mb-3">Log Practice Attempt</h4>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-muted mb-1">Outcome</label>
          <select 
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as any)}
            className="w-full bg-surface border border-border rounded-md text-sm p-2 text-foreground focus:outline-none focus:border-accent"
          >
            <option value="solved_independently">Solved Independently</option>
            <option value="solved_with_hint">Solved with Hint</option>
            <option value="understood_but_could_not_code">Understood but could not code</option>
            <option value="pattern_not_identified">Pattern not identified</option>
            <option value="skipped">Skipped</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input 
            type="checkbox" 
            id="hintUsed"
            checked={hintUsed}
            onChange={(e) => setHintUsed(e.target.checked)}
            className="rounded border-border bg-surface text-accent focus:ring-accent"
          />
          <label htmlFor="hintUsed" className="text-sm text-foreground">I used hints</label>
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">Time taken (seconds)</label>
          <input 
            type="number"
            value={durationStr}
            onChange={(e) => setDurationStr(e.target.value)}
            placeholder="e.g. 1200 for 20m"
            className="w-full bg-surface border border-border rounded-md text-sm p-2 text-foreground focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex-1 py-1.5 text-sm rounded border border-border hover:bg-surface text-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 py-1.5 text-sm bg-accent text-accent-foreground rounded font-medium disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
