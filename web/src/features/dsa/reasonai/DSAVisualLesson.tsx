"use client";

import { useEffect, useId, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Pause, Play, RotateCcw } from "lucide-react";
import type { VisualLesson, VisualStep } from "./visual-contract";

function ArrayScene({ step }: { step: VisualStep }) {
  return <div className="flex min-h-32 items-center overflow-x-auto px-5 py-4"><div className="mx-auto flex gap-2">
    {step.values.map((value, index) => <div key={index} className="relative flex w-14 shrink-0 flex-col items-center gap-2">
      <span className="text-[10px] tabular-nums text-muted">{index}</span>
      <div className={`flex min-h-14 w-full items-center justify-center rounded-xl border px-1 py-2 text-center font-mono text-sm ${step.highlights.includes(index) ? "border-accent bg-accent/15 text-foreground" : "border-border/60 bg-background/70 text-foreground/80"}`}>{value}</div>
      <div className="min-h-5 space-y-1">{step.pointers.filter((pointer) => pointer.index === index).map((pointer, i) => <span key={i} className="block text-center text-[10px] font-medium text-accent">↑ {pointer.label}</span>)}</div>
    </div>)}
  </div></div>;
}

function GraphScene({ step }: { step: VisualStep }) {
  const marker = useId().replaceAll(":", "");
  const point = (node: VisualStep["nodes"][number]) => ({ x: 45 + node.x * 4.1, y: 35 + node.y * 2.3 });
  return <svg viewBox="0 0 500 300" role="img" aria-label={step.title} className="mx-auto max-h-80 w-full min-w-64">
    <title>{step.title}</title><desc>{step.explanation}</desc>
    <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
    {step.edges.map((edge, i) => {
      const from = point(step.nodes.find((node) => node.id === edge.from)!);
      const to = point(step.nodes.find((node) => node.id === edge.to)!);
      const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      return <g key={i} className="text-muted"><line x1={from.x} y1={from.y} x2={to.x - (to.x - from.x) / length * 23} y2={to.y - (to.y - from.y) / length * 23} stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.5" markerEnd={`url(#${marker})`} />{edge.label && <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 7} textAnchor="middle" fill="currentColor" fontSize="10">{edge.label}</text>}</g>;
    })}
    {step.nodes.map((node) => { const p = point(node); return <g key={node.id} className={node.state === "active" ? "text-accent" : node.state === "visited" ? "text-success" : "text-muted"}>
      <circle cx={p.x} cy={p.y} r="22" className="fill-background" stroke="currentColor" strokeWidth={node.state === "active" ? 3 : 1.5} strokeDasharray={node.state === "visited" ? "3 2" : undefined} />
      <text x={p.x} y={p.y + 4} textAnchor="middle" fill="currentColor" fontSize={node.label.length > 5 ? 9 : 12}>{node.label}</text>
    </g>; })}
  </svg>;
}

function GridScene({ step }: { step: VisualStep }) {
  return <div className="overflow-x-auto px-5 py-7"><table aria-label="Algorithm grid" className="mx-auto border-separate border-spacing-1.5"><tbody>{step.rows.map((row, r) => <tr key={r}>{row.map((value, c) => <td key={c} className={`h-12 min-w-12 rounded-lg border p-2 text-center font-mono text-sm ${step.activeCells.some((cell) => cell.row === r && cell.column === c) ? "border-accent bg-accent/15" : "border-border/60 bg-background/70"}`}>{value}</td>)}</tr>)}</tbody></table></div>;
}

export function DSAVisualLesson({ lesson, onExpand, stage = false, onStepChange, active = true, initialStepNumber = 1, largeText = false }: { lesson: VisualLesson; onExpand?: () => void; stage?: boolean; onStepChange?: (stepNumber: number) => void; active?: boolean; initialStepNumber?: number; largeText?: boolean }) {
  const [index, setIndex] = useState(Math.max(0, Math.min(lesson.steps.length - 1, initialStepNumber - 1)));
  const [playing, setPlaying] = useState(false);
  const step = lesson.steps[index];
  useEffect(() => { onStepChange?.(index + 1); }, [index, onStepChange]);
  useEffect(() => {
    if (!playing || !active) return;
    const timer = setInterval(() => setIndex((current) => current < lesson.steps.length - 1 ? current + 1 : current), 4500);
    return () => clearInterval(timer);
  }, [playing, active, lesson.steps.length]);
  const finished = index === lesson.steps.length - 1;
  // Stop the timer at the end without advancing past the validated snapshots.
  useEffect(() => { if (finished && playing) { const timer = setTimeout(() => setPlaying(false), 0); return () => clearTimeout(timer); } }, [finished, playing]);
  useEffect(() => { if (!active && playing) { const timer = setTimeout(() => setPlaying(false), 0); return () => clearTimeout(timer); } }, [active, playing]);
  function go(next: number) { setPlaying(false); setIndex(next); }
  const button = "rounded-lg p-2 text-muted hover:bg-surface-elevated hover:text-foreground disabled:opacity-30";
  return <section aria-label={`Visual walkthrough: ${lesson.title}`} className={`overflow-hidden rounded-2xl border border-border/60 bg-surface/40 ${stage ? "flex h-full min-h-0 flex-col" : "my-5"}`}>
    <header className="flex shrink-0 items-start justify-between gap-3 px-5 py-4"><div><p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-accent">Visual walkthrough</p><h3 className="font-medium">{lesson.title}</h3><p className="mt-1 text-xs text-muted">{lesson.basis === "illustrative" ? "Illustrative example · not an official test case" : lesson.basis === "user_example" ? "Using your example" : "Example from retrieved sources"}</p></div>{onExpand && <button type="button" aria-label="Expand visual walkthrough" title="Focus on tutor" onClick={onExpand} className={button}><Maximize2 size={16} /></button>}</header>
    <div className={`overflow-auto bg-background/30 ${stage ? "flex min-h-28 flex-1 items-center justify-center" : ""}`}><div className="w-full">{lesson.kind === "array" ? <ArrayScene step={step} /> : lesson.kind === "graph" ? <GraphScene step={step} /> : <GridScene step={step} />}</div></div>
    {!!step.variables.length && <dl className="flex shrink-0 flex-wrap gap-x-5 gap-y-2 border-t border-border/40 px-5 py-3 font-mono text-xs">{step.variables.map((variable, i) => <div key={i} className="flex gap-2"><dt className="text-muted">{variable.name}</dt><dd>{variable.value}</dd></div>)}</dl>}
    <div aria-live={playing ? "off" : "polite"} aria-atomic="true" tabIndex={stage ? 0 : undefined} className={`shrink-0 border-t border-border/40 px-5 py-4 ${stage ? "max-h-36 overflow-y-auto" : "min-h-28"}`}><p className="mb-1 text-sm font-medium">{step.title}</p><p className={`whitespace-pre-wrap leading-7 text-muted ${largeText ? "text-base" : "text-sm"}`}>{step.explanation}</p></div>
    <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/40 px-3 py-2"><button type="button" onClick={() => { if (finished) setIndex(0); setPlaying(!playing); }} aria-label={playing ? "Pause walkthrough" : finished ? "Replay walkthrough" : "Play walkthrough"} className={button}>{playing ? <Pause size={17} /> : finished ? <RotateCcw size={17} /> : <Play size={17} />}</button><button type="button" aria-label="Previous step" disabled={!index} onClick={() => go(index - 1)} className={button}><ChevronLeft size={17} /></button>
      <input aria-label="Walkthrough step" type="range" min={1} max={lesson.steps.length} value={index + 1} onChange={(event) => go(Number(event.target.value) - 1)} className="min-w-16 flex-1 accent-accent" />
      <span className="px-1 text-xs tabular-nums text-muted">{index + 1} / {lesson.steps.length}</span><button type="button" aria-label="Next step" disabled={finished} onClick={() => go(index + 1)} className={button}><ChevronRight size={17} /></button>
    </footer>
  </section>;
}
