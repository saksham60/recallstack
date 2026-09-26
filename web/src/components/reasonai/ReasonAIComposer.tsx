import type { ReactNode } from "react";
import { ArrowUp, Square } from "lucide-react";

export function ReasonAIComposer({ draft, onDraftChange, pending, onSend, onStop, controls }: {
  draft: string; onDraftChange: (value: string) => void; pending: boolean;
  onSend: () => void; onStop: () => void; controls?: ReactNode;
}) {
  return <form onSubmit={(event) => { event.preventDefault(); onSend(); }} className="rounded-2xl border border-border bg-background/70 p-3 transition-colors focus-within:border-accent/70">
    <textarea aria-label="Ask ReasonAI" placeholder="Ask ReasonAI…" value={draft} onChange={(event) => onDraftChange(event.target.value)} maxLength={4000} rows={2}
      onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSend(); } }}
      className="w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted" />
    <div className="flex items-center justify-between gap-2 pt-2">
      <div>{controls}</div><div className="flex items-center gap-3"><span className="text-[11px] text-muted">Nemotron</span>
        {pending ? <button type="button" onClick={onStop} aria-label="Stop response" className="rounded-lg bg-surface-elevated p-2"><Square size={16} /></button>
          : <button type="submit" aria-label="Send message" disabled={!draft.trim()} className="rounded-lg bg-accent p-2 text-accent-foreground disabled:opacity-30"><ArrowUp size={17} /></button>}
      </div>
    </div>
  </form>;
}
