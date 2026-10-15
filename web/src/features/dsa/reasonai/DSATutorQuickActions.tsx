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

const workspaceActions = [
  { action: "explain", label: "Explain the problem", icon: Route },
  { action: "hint", label: "Give me a hint", icon: Lightbulb },
  { action: "chat", label: "Find an edge case", icon: ScanLine },
  { action: "review", label: "Spot the bug", icon: ScanLine },
  { action: "review", label: "Review my approach", icon: MessageSquareText },
  { action: "review", label: "Review my code", icon: MessageSquareText },
  { action: "complexity", label: "Explain time complexity", icon: ChartNoAxesCombined },
  { action: "complexity", label: "Explain space complexity", icon: ChartNoAxesCombined },
  { action: "visualize", label: "Visualize the algorithm", icon: Play },
  { action: "chat", label: "Explain my failed public test", icon: ScanLine },
] as const;

export function DSATutorQuickActions({ onAction, disabled, workspace = false, publicResult = false }: { onAction: (action: DSATutorAction, message: string) => void; disabled: boolean; workspace?: boolean; publicResult?: boolean }) {
  return <div className="grid grid-cols-2 gap-2" aria-label="Learning actions">
    {(workspace ? workspaceActions : actions).map(({ action, label, icon: Icon }) => <button key={label} type="button" onClick={() => onAction(action, label)} disabled={disabled || (label === "Explain my failed public test" && !publicResult)}
      className="flex items-center gap-2.5 rounded-xl border border-border/50 px-3 py-3 text-left text-xs transition-colors hover:border-accent/50 hover:bg-accent/5 disabled:opacity-40">
      <Icon size={15} className="shrink-0 text-accent" />{label}
    </button>)}
  </div>;
}
