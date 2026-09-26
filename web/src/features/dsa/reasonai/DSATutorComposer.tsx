import { Globe } from "lucide-react";
import { ReasonAIComposer } from "@/components/reasonai/ReasonAIComposer";
import type { DSATutor } from "./use-dsa-tutor";

export function DSATutorComposer({ tutor }: { tutor: DSATutor }) {
  return <ReasonAIComposer draft={tutor.draft} onDraftChange={tutor.setDraft} pending={tutor.pending}
    onSend={() => tutor.send("chat", tutor.draft)} onStop={tutor.stop}
    controls={<button type="button" aria-pressed={tutor.searchWeb} onClick={() => tutor.setSearchWeb(!tutor.searchWeb)} title="Search fresh web references. Linked problem context is retrieved automatically when needed. Powered by Tavily."
      className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors ${tutor.searchWeb ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-elevated"}`}><Globe size={14} />Search web</button>} />;
}
