import { Lightbulb, Route, Play, ScanLine, MessageSquareText, ChartNoAxesCombined } from "lucide-react";
import type { DSATutorAction } from "./contract";

const actions = [
  { action: "hint", label: "Give me a hint", icon: Lightbulb },
  { action: "explain", label: "Explain the pattern", icon: Route },
  { action: "start", label: "Help me start", icon: Play },
  { action: "trace", label: "Trace an example", icon: ScanLine },
  { action: "review", label: "Review my approach", icon: MessageSquareText },
  { action: "complexity", label: "Analyze complexity", icon: ChartNoAxesCombined },
] as const;

export function DSATutorQuickActions({ onAction, disabled }: { onAction: (action: DSATutorAction, message: string) => void; disabled: boolean }) {
  return <div className="grid grid-cols-2 gap-2" aria-label="Learning actions">
    {actions.map(({ action, label, icon: Icon }) => <button key={action} type="button" onClick={() => onAction(action, label)} disabled={disabled}
      className="flex items-center gap-2.5 rounded-xl border border-border/50 px-3 py-3 text-left text-xs transition-colors hover:border-accent/50 hover:bg-accent/5 disabled:opacity-40">
      <Icon size={15} className="shrink-0 text-accent" />{label}
    </button>)}
  </div>;
}
