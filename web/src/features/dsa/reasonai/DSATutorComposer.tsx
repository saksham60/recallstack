import { ArrowUp, Globe, Square } from "lucide-react";
import type { DSATutor } from "./use-dsa-tutor";

export function DSATutorComposer({ tutor }: { tutor: DSATutor }) {
  const submit = () => tutor.send("chat", tutor.draft);
  return <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="rounded-2xl border border-border bg-background/70 p-3 focus-within:border-accent/70 transition-colors">
    <textarea aria-label="Ask ReasonAI" placeholder="Ask ReasonAI…" value={tutor.draft} onChange={(event) => tutor.setDraft(event.target.value)} maxLength={4000} rows={2}
      onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }}
      className="w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted" />
    <div className="flex items-center justify-between gap-2 pt-2">
      <button type="button" aria-pressed={tutor.searchWeb} onClick={() => tutor.setSearchWeb(!tutor.searchWeb)} title="Search fresh web references. Linked problem context is retrieved automatically when needed. Powered by Tavily."
        className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors ${tutor.searchWeb ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-elevated"}`}><Globe size={14} />Search web</button>
      <div className="flex items-center gap-3"><span className="text-[11px] text-muted">Nemotron</span>
        {tutor.pending ? <button type="button" onClick={tutor.stop} aria-label="Stop response" className="rounded-lg bg-surface-elevated p-2"><Square size={16} /></button>
          : <button type="submit" aria-label="Send message" disabled={!tutor.draft.trim()} className="rounded-lg bg-accent p-2 text-accent-foreground disabled:opacity-30"><ArrowUp size={17} /></button>}
      </div>
    </div>
  </form>;
}
