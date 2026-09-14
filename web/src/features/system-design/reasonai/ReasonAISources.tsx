import { ArrowUpRight } from "lucide-react";
import { parseReasonAISources, type ReasonAISource } from "./sources";

export function ReasonAISources({ sources }: { sources: ReasonAISource[] }) {
  const valid = parseReasonAISources(sources);
  if (!valid.length) return null;
  return <div aria-label="Research sources" className="border-t border-border/40 pt-3"><p className="mb-2 text-[10px] uppercase tracking-wider text-muted">Sources</p><div className="flex flex-wrap gap-2">{valid.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className="max-w-full rounded-lg bg-background/70 px-2.5 py-2 text-xs hover:text-accent"><span className="flex items-center gap-1 text-[10px] text-muted">[{source.id}] {new URL(source.url).hostname}<ArrowUpRight size={11} /></span><span className="mt-1 block truncate">{source.title}</span></a>)}</div><p className="mt-2 text-[10px] text-muted">Research powered by Tavily</p></div>;
}
