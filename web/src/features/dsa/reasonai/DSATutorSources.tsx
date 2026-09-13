import { ArrowUpRight } from "lucide-react";
import { safeExternalUrl, type DSATutorSource } from "./contract";

export function DSATutorSources({ sources }: { sources: DSATutorSource[] }) {
  const valid = sources.filter((source) => safeExternalUrl(source.url));
  if (!valid.length) return null;
  return <div className="mt-4 border-t border-border/50 pt-3">
    <div className="mb-2 flex items-center justify-between text-[10px] text-muted"><span className="uppercase tracking-wider">Sources</span><span>Powered by Tavily</span></div>
    <div className="flex flex-wrap gap-2">{valid.map((source, index) => <a key={`${index}-${source.url}`} href={source.url} target="_blank" rel="noopener noreferrer"
      className="min-w-0 max-w-full rounded-lg bg-surface-elevated/60 px-2.5 py-2 text-xs hover:text-accent">
      <span className="flex items-center gap-1.5 text-muted">{index + 1}. {new URL(source.url).hostname.replace(/^www\./, "")}<ArrowUpRight size={12} /></span>
      <span className="mt-1 block truncate">{source.title}</span>
    </a>)}</div>
  </div>;
}
