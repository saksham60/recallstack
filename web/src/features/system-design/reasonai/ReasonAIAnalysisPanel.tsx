"use client";

import { useState } from "react";
import { ChevronDown, Sparkles, X } from "lucide-react";
import type { SystemDesignDiagram } from "../types/system-design.types";
import type { ReasonAIAnalysisAnnotation, ReasonAIVisualization } from "./visualization";

const tone = { critical: "text-danger border-danger/40", warning: "text-warning border-warning/40", healthy: "text-success border-success/40", info: "text-accent border-accent/40" };
function Detail({ item }: { item: ReasonAIAnalysisAnnotation }) {
  return <div className="space-y-2 text-xs leading-5 text-muted">
    {item.label && <p className="font-medium text-foreground">{item.label}</p>}
    {item.reason && <p>{item.reason}</p>}
    {item.assumption && <p><span className="text-foreground/80">Assumption: </span>{item.assumption}</p>}
    {item.metric && <div className="rounded-lg bg-background/60 p-2.5"><p className="text-foreground">{item.metric.label}: {item.metric.value}</p><p className="mt-1 capitalize text-accent">{item.metric.basis}</p><p className="mt-1">{item.metric.evidence}</p></div>}
  </div>;
}
export function ReasonAIAnalysisPanel({ visualization, diagram, selectedNodeIds, selectedEdgeIds, onClear, onSelectNode, onSelectEdge }: {
  visualization: ReasonAIVisualization; diagram: SystemDesignDiagram; selectedNodeIds: string[]; selectedEdgeIds: string[];
  onClear: () => void; onSelectNode: (id: string) => void; onSelectEdge: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selected = visualization.nodes.find((item) => selectedNodeIds.includes(item.nodeId)) ?? visualization.edges.find((item) => selectedEdgeIds.includes(item.edgeId));
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node.label]));
  return <section aria-label="ReasonAI analysis" className="absolute left-[4.25rem] top-3 z-20 w-72 max-w-[calc(100%-5rem)] overflow-hidden rounded-xl border border-[var(--editor-border)] bg-[var(--editor-floating)] shadow-xl backdrop-blur">
    <header className="flex items-center gap-2 px-3 py-2.5"><Sparkles size={15} className="shrink-0 text-accent" /><button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="min-w-0 flex-1 text-left"><span className="block text-[10px] uppercase tracking-wide text-muted">ReasonAI analysis · local</span><span className="block truncate text-xs font-medium">{visualization.title}</span></button><button type="button" aria-label="Expand analysis details" onClick={() => setExpanded(!expanded)} className="p-1 text-muted"><ChevronDown size={14} /></button><button type="button" onClick={onClear} aria-label="Clear analysis" title="Clear analysis" className="rounded p-1 text-muted hover:bg-surface-elevated"><X size={15} /></button></header>
    <div className="flex flex-wrap gap-3 border-t border-border/40 px-3 py-2 text-[10px]"><span className="capitalize text-muted">{visualization.type}{visualization.type === "failure" ? " · Hypothetical" : ""}</span><span className="text-danger">Critical</span><span className="text-warning">Risk</span><span className="text-success">Healthy</span></div>
    {selected && !expanded && <div className="max-h-48 overflow-y-auto border-t border-border/40 p-3"><Detail item={selected} /></div>}
    {expanded && <div className="max-h-[45vh] space-y-4 overflow-y-auto border-t border-border/40 p-3">
      <p className="whitespace-pre-wrap text-xs leading-5 text-muted">{visualization.summary}</p>
      {!!visualization.assumptions.length && <div className="text-xs leading-5 text-muted"><p className="mb-1 font-medium text-foreground">Assumptions</p><ul className="list-disc space-y-1 pl-4">{visualization.assumptions.map((assumption, i) => <li key={i}>{assumption}</li>)}</ul></div>}
      {visualization.nodes.map((item, index) => <details key={item.nodeId} className="border-t border-border/40 pt-3"><summary className={`cursor-pointer text-xs ${tone[item.severity ?? "info"]}`}><span>{index + 1}. {nodes.get(item.nodeId) || "Component"}</span><span className="ml-2 capitalize text-[10px]">{item.severity ?? "info"}</span></summary><div className="pt-2"><Detail item={item} /><button type="button" onClick={() => onSelectNode(item.nodeId)} className="mt-2 text-xs text-accent">Select component</button></div></details>)}
      {visualization.edges.map((item) => { const edge = diagram.edges.find((edge) => edge.id === item.edgeId); return <details key={item.edgeId} className="border-t border-border/40 pt-3"><summary className={`cursor-pointer text-xs ${tone[item.severity ?? "info"]}`}>{edge?.label || `${nodes.get(edge?.sourceNodeId ?? "") || "Component"} → ${nodes.get(edge?.targetNodeId ?? "") || "Component"}`}</summary><div className="pt-2"><Detail item={item} /><button type="button" onClick={() => onSelectEdge(item.edgeId)} className="mt-2 text-xs text-accent">Select connection</button></div></details>; })}
    </div>}
  </section>;
}
