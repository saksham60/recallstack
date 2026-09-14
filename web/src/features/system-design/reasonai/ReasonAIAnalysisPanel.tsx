"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronDown, GripHorizontal, Grip, Sparkles, X } from "lucide-react";
import type { SystemDesignDiagram } from "../types/system-design.types";
import type { ReasonAIAnalysisAnnotation, ReasonAIVisualization } from "./visualization";

const tone = { critical: "text-danger border-danger/40", warning: "text-warning border-warning/40", healthy: "text-success border-success/40", info: "text-accent border-accent/40" };
interface PanelFrame { x: number; y: number; width: number; height: number }
function fitFrame(frame: PanelFrame, container: HTMLElement, renderedHeight?: number): PanelFrame {
  const availableWidth = Math.max(0, container.clientWidth - 16);
  const availableHeight = Math.max(0, container.clientHeight - 16);
  const width = Math.min(availableWidth, Math.max(260, frame.width));
  const height = Math.min(availableHeight, Math.max(180, frame.height));
  return {
    width, height,
    x: Math.max(8, Math.min(frame.x, container.clientWidth - width - 8)),
    y: Math.max(8, Math.min(frame.y, container.clientHeight - (renderedHeight ?? height) - 8)),
  };
}
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
  const [frame, setFrame] = useState<PanelFrame>({ x: 68, y: 12, width: 288, height: 520 });
  const panel = useRef<HTMLElement>(null);
  const interaction = useRef<{ pointerId: number; kind: "move" | "resize"; x: number; y: number; frame: PanelFrame } | null>(null);
  useEffect(() => {
    const element = panel.current, container = element?.parentElement;
    if (!element || !container) return;
    const observer = new ResizeObserver(() => {
      setFrame((current) => {
        const next = fitFrame(current, container, element.offsetHeight);
        return Object.keys(next).every((key) => next[key as keyof PanelFrame] === current[key as keyof PanelFrame]) ? current : next;
      });
    });
    observer.observe(container);
    observer.observe(element);
    return () => { observer.disconnect(); interaction.current = null; };
  }, []);
  function begin(event: PointerEvent<HTMLButtonElement>, kind: "move" | "resize") {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.focus();
    interaction.current = { pointerId: event.pointerId, kind, x: event.clientX, y: event.clientY, frame };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const active = interaction.current, element = panel.current, container = element?.parentElement;
    if (!active || active.pointerId !== event.pointerId || !element || !container) return;
    const dx = event.clientX - active.x, dy = event.clientY - active.y;
    const next = active.kind === "move"
      ? { ...active.frame, x: active.frame.x + dx, y: active.frame.y + dy }
      : { ...active.frame, width: active.frame.width + dx, height: active.frame.height + (expanded ? dy : 0) };
    setFrame(fitFrame(next, container, active.kind === "resize" && expanded ? undefined : element.offsetHeight));
  }
  function end(event: PointerEvent<HTMLButtonElement>) {
    if (interaction.current?.pointerId !== event.pointerId) return;
    interaction.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function adjustWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, kind: "move" | "resize") {
    const direction: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const delta = direction[event.key], element = panel.current, container = element?.parentElement;
    if (!delta || !element || !container) return;
    event.preventDefault();
    const step = event.shiftKey ? 48 : 16;
    setFrame((current) => fitFrame(kind === "move"
      ? { ...current, x: current.x + delta[0] * step, y: current.y + delta[1] * step }
      : { ...current, width: current.width + delta[0] * step, height: current.height + (expanded ? delta[1] * step : 0) }, container, kind === "resize" && expanded ? undefined : element.offsetHeight));
  }
  const selected = visualization.nodes.find((item) => selectedNodeIds.includes(item.nodeId)) ?? visualization.edges.find((item) => selectedEdgeIds.includes(item.edgeId));
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node.label]));
  return <section ref={panel} aria-label="ReasonAI analysis" style={{ left: frame.x, top: frame.y, width: frame.width, height: expanded ? frame.height : undefined }} onKeyDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} className="absolute z-30 flex max-h-[calc(100%-1rem)] max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-xl border border-[var(--editor-border)] bg-[var(--editor-floating)] shadow-xl backdrop-blur">
    <header className="flex shrink-0 items-center gap-1 px-2 py-2">
      <button type="button" aria-label="Move analysis panel" title="Drag to move · Use arrow keys to reposition" onPointerDown={(event) => begin(event, "move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { interaction.current = null; }} onKeyDown={(event) => adjustWithKeyboard(event, "move")} className="flex min-w-0 flex-1 touch-none select-none items-center gap-2 rounded px-1 py-0.5 text-left cursor-grab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing">
        <Sparkles size={15} className="shrink-0 text-accent" /><span className="min-w-0 flex-1"><span className="block text-[10px] uppercase tracking-wide text-muted">ReasonAI analysis · local</span><span className="block truncate text-xs font-medium">{visualization.title}</span></span><GripHorizontal size={13} className="shrink-0 text-muted/60" />
      </button>
      <button type="button" aria-label={expanded ? "Collapse analysis details" : "Expand analysis details"} aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="rounded p-1 text-muted hover:bg-surface-elevated"><ChevronDown size={14} className={expanded ? "rotate-180" : undefined} /></button>
      <button type="button" onClick={onClear} aria-label="Clear analysis" title="Clear analysis" className="rounded p-1 text-muted hover:bg-surface-elevated"><X size={15} /></button>
    </header>
    <div className="flex shrink-0 flex-wrap gap-3 border-t border-border/40 px-3 py-2 pr-6 text-[10px]"><span className="capitalize text-muted">{visualization.type}{visualization.type === "failure" ? " · Hypothetical" : ""}</span><span className="text-danger">Critical</span><span className="text-warning">Risk</span><span className="text-success">Healthy</span></div>
    {selected && !expanded && <div className="max-h-48 overflow-y-auto border-t border-border/40 p-3"><Detail item={selected} /></div>}
    {expanded && <div className="min-h-0 flex-1 space-y-4 overflow-y-auto border-t border-border/40 p-3 pb-6">
      <p className="whitespace-pre-wrap text-xs leading-5 text-muted">{visualization.summary}</p>
      {!!visualization.assumptions.length && <div className="text-xs leading-5 text-muted"><p className="mb-1 font-medium text-foreground">Assumptions</p><ul className="list-disc space-y-1 pl-4">{visualization.assumptions.map((assumption, i) => <li key={i}>{assumption}</li>)}</ul></div>}
      {visualization.nodes.map((item, index) => <details key={item.nodeId} className="border-t border-border/40 pt-3"><summary className={`cursor-pointer text-xs ${tone[item.severity ?? "info"]}`}><span>{index + 1}. {nodes.get(item.nodeId) || "Component"}</span><span className="ml-2 capitalize text-[10px]">{item.severity ?? "info"}</span></summary><div className="pt-2"><Detail item={item} /><button type="button" onClick={() => onSelectNode(item.nodeId)} className="mt-2 text-xs text-accent">Select component</button></div></details>)}
      {visualization.edges.map((item) => { const edge = diagram.edges.find((edge) => edge.id === item.edgeId); return <details key={item.edgeId} className="border-t border-border/40 pt-3"><summary className={`cursor-pointer text-xs ${tone[item.severity ?? "info"]}`}>{edge?.label || `${nodes.get(edge?.sourceNodeId ?? "") || "Component"} → ${nodes.get(edge?.targetNodeId ?? "") || "Component"}`}</summary><div className="pt-2"><Detail item={item} /><button type="button" onClick={() => onSelectEdge(item.edgeId)} className="mt-2 text-xs text-accent">Select connection</button></div></details>; })}
    </div>}
    <button type="button" aria-label="Resize analysis panel" title={expanded ? "Drag to resize · Use arrow keys to adjust" : "Drag to adjust width · Expand for height adjustment"} onPointerDown={(event) => begin(event, "resize")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { interaction.current = null; }} onKeyDown={(event) => adjustWithKeyboard(event, "resize")} className={`absolute bottom-0.5 right-0.5 flex h-5 w-5 touch-none select-none items-center justify-center rounded text-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${expanded ? "cursor-nwse-resize" : "cursor-ew-resize"}`}><Grip size={13} /></button>
  </section>;
}
