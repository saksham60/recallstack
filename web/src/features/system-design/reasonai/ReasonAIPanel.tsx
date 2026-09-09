"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { ArrowUp, GripHorizontal, LoaderCircle, RotateCcw, Sparkles, Square, Trash2, X } from "lucide-react";
import { buttonClass } from "@/features/admin/components/AdminPrimitives";
import type { SystemDesignDiagram, SystemDesignPoint, SystemDesignProblem } from "../types/system-design.types";
import { buildReasonAIContext, parseReasonAIProposal, record, REASONAI_INVALID_PROPOSAL, REASONAI_MODES, type ReasonAIMessage, type ReasonAIMode, type ReasonAIProposal } from "./contract";
import { normalizeReasonAIVisibleText } from "./visible-text";
import { ReasonAISuggestions, type ReasonAISuggestionActions } from "./ReasonAISuggestions";

interface Turn extends ReasonAIMessage { id: string; proposal?: ReasonAIProposal }
interface Generation { question: string; mode: ReasonAIMode; history: ReasonAIMessage[] }
export interface ReasonAIPanelHandle { dropSuggestion: (token: string, position: SystemDesignPoint) => void }
interface PanelPosition { x: number; y: number }
function constrainPosition(position: PanelPosition, container: HTMLElement, panel: HTMLElement): PanelPosition {
  const x = Math.max(16, Math.min(position.x, container.clientWidth - panel.offsetWidth - 16));
  const y = Math.max(16, Math.min(position.y, container.clientHeight - panel.offsetHeight - 16));
  return x === position.x && y === position.y ? position : { x, y };
}
export function ReasonAIPanel({ ref, diagram, title, problem, selectedNodeIds, selectedEdgeIds, canApply, live, onCommit, onUndo, undoUnavailable }: ReasonAISuggestionActions & {
  ref?: Ref<ReasonAIPanelHandle>;
  diagram: SystemDesignDiagram; title: string; problem?: SystemDesignProblem;
  selectedNodeIds: string[]; selectedEdgeIds: string[]; canApply: boolean; live: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ReasonAIMode>("chat");
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const pending = useRef<AbortController | null>(null);
  const lastGeneration = useRef<Generation | null>(null);
  const pendingDrop = useRef<{ token: string; drop: (position: SystemDesignPoint) => void } | null>(null);
  useImperativeHandle(ref, () => ({ dropSuggestion(token, point) {
    const suggestion = pendingDrop.current;
    pendingDrop.current = null;
    if (canApply && suggestion?.token === token) suggestion.drop(point);
  } }), [canApply]);
  const container = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  useEffect(() => {
    const bounds = container.current, dialog = panel.current;
    if (!open || !bounds || !dialog) return;
    // Keep the header reachable when the canvas shrinks or a reply grows.
    const observer = new ResizeObserver(() => {
      setPosition((current) => current ? constrainPosition(current, bounds, dialog) : current);
    });
    observer.observe(bounds);
    observer.observe(dialog);
    return () => { observer.disconnect(); drag.current = null; };
  }, [open]);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); event.stopImmediatePropagation(); setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", shortcut, true);
    return () => window.removeEventListener("keydown", shortcut, true);
  }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    const container = scroll.current;
    const reply = container?.querySelector<HTMLElement>("article:last-of-type");
    if (!container) return;
    const top = !busy && reply
      ? container.scrollTop + reply.getBoundingClientRect().top - container.getBoundingClientRect().top - 16
      : container.scrollHeight;
    container.scrollTo({ top });
  }, [turns, busy]);
  const close = () => { setOpen(false); launcher.current?.focus(); };
  const selected = selectedNodeIds.length + selectedEdgeIds.length;
  function quick(nextMode: ReasonAIMode, prompt: string) { setMode(nextMode); setMessage(`${prompt} ${selected ? "the selected components and connections" : "this architecture"}.`); setOpen(true); }
  async function send(retry?: Generation) {
    if (pending.current || (!retry && !message.trim())) return;
    setError(null);
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    const timeout = setTimeout(() => controller.abort(), 65_000);
    const generation = retry ?? { question: message.trim(), mode, history: turns.slice(-10).map(({ role, content }) => ({ role, content: content.slice(0, 8000) })) };
    lastGeneration.current = generation;
    if (!retry) {
      setTurns((previous) => [...previous, { id: crypto.randomUUID(), role: "user", content: generation.question }]);
      setMessage("");
    }
    try {
      const context = buildReasonAIContext(diagram, title, problem, selectedNodeIds, selectedEdgeIds);
      const response = await fetch("/api/reasonai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ mode: generation.mode, message: generation.question, history: generation.history, context }) });
      if (response.redirected || response.status === 401) throw new Error("Sign in to use ReasonAI, then try again.");
      let data;
      try { data = record(await response.json()); }
      catch { throw new Error("ReasonAI could not complete that response. Please try again."); }
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "ReasonAI is unavailable. Please try again.");
      if (typeof data.text !== "string" || data.text.length > 16_000) throw new Error("ReasonAI returned an invalid response. Please try again.");
      let proposal;
      try { proposal = data.proposal ? parseReasonAIProposal(data.proposal, context) : undefined; }
      catch { throw new Error(REASONAI_INVALID_PROPOSAL); }
      const content = normalizeReasonAIVisibleText(data.text, context, proposal);
      if (pending.current !== controller) return;
      setTurns((previous) => [...previous, { id: crypto.randomUUID(), role: "assistant", content, proposal }]);
    } catch (error) {
      if (pending.current === controller) setError(controller.signal.aborted ? "Request cancelled or timed out. You can try again." : error instanceof Error ? error.message : "ReasonAI is unavailable. Please try again.");
    } finally { clearTimeout(timeout); if (pending.current === controller) { pending.current = null; setBusy(false); } }
  }
  function clearConversation() {
    pending.current?.abort(); pending.current = null; pendingDrop.current = null;
    lastGeneration.current = null;
    setTurns([]); setMessage(""); setError(null); setBusy(false);
  }
  return (
    <div ref={container} className="pointer-events-none absolute inset-0 z-20">
      {(
        <section ref={panel} role="dialog" aria-label="ReasonAI" style={{ ...(position ? { left: position.x, top: position.y, right: "auto" } : {}), ...(!open ? { display: "none" } : {}) }} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); close(); } }} className="pointer-events-auto absolute right-4 top-4 z-10 flex h-[calc(100%-6rem)] w-[480px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div role="button" tabIndex={0} aria-label="Move ReasonAI" title="Drag to move · Arrow keys to reposition" className="mr-3 min-w-0 flex-1 touch-none select-none cursor-grab rounded focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing"
              onPointerDown={(event) => {
                if (event.button !== 0 || !event.isPrimary || !panel.current) return;
                event.preventDefault(); event.stopPropagation();
                event.currentTarget.focus();
                const rect = panel.current.getBoundingClientRect();
                drag.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const active = drag.current;
                if (!active || active.pointerId !== event.pointerId || !container.current || !panel.current) return;
                event.stopPropagation();
                const bounds = container.current.getBoundingClientRect();
                setPosition(constrainPosition({ x: event.clientX - bounds.left - active.offsetX, y: event.clientY - bounds.top - active.offsetY }, container.current, panel.current));
              }}
              onPointerUp={(event) => {
                if (drag.current?.pointerId !== event.pointerId) return;
                drag.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => { drag.current = null; }}
              onLostPointerCapture={() => { drag.current = null; }}
              onKeyDown={(event) => {
                const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
                if (!direction || !container.current || !panel.current) return;
                event.preventDefault(); event.stopPropagation();
                const bounds = container.current.getBoundingClientRect(), rect = panel.current.getBoundingClientRect();
                const step = event.shiftKey ? 48 : 16;
                setPosition(constrainPosition({ x: rect.left - bounds.left + direction[0] * step, y: rect.top - bounds.top + direction[1] * step }, container.current, panel.current));
              }}
            ><h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-accent" />ReasonAI<GripHorizontal aria-hidden="true" className="ml-auto h-4 w-4 text-muted" /></h2><p className="mt-1 text-xs text-muted">Private chat · You choose what goes on the canvas</p></div>
            <button type="button" className="mr-3 rounded p-1 text-muted hover:text-foreground" aria-label="Clear conversation" title="Clear conversation" onClick={clearConversation}><Trash2 className="h-4 w-4" /></button>
            <button type="button" className={buttonClass} aria-label="Close ReasonAI" onClick={close}><X className="h-4 w-4" /></button>
          </header>
          <div ref={scroll} role="log" aria-label="ReasonAI conversation" aria-busy={busy} className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 text-sm">
            {!turns.length && <p className="text-muted">{diagram.nodes.length ? "Ask about tradeoffs, find issues, or propose improvements to your design." : "Start with a design goal, such as: Design a URL shortener for 100M users."}</p>}
            {turns.map((turn, index) => <article key={turn.id} className={turn.role === "user" ? "ml-8 space-y-2 rounded-2xl bg-background/70 p-3" : "space-y-3"}>
              <p className="flex items-center gap-2 text-xs font-semibold text-muted">{turn.role === "assistant" && <Sparkles className="h-4 w-4 text-accent" />}{turn.role === "user" ? "You" : "ReasonAI"}</p>
              <p className="whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">{turn.content}</p>
              {turn.proposal && <ReasonAISuggestions proposal={turn.proposal} diagram={diagram} canApply={canApply} live={live} onCommit={onCommit} onUndo={onUndo} undoUnavailable={undoUnavailable} onStartDrag={(token, drop) => { pendingDrop.current = { token, drop }; }} onEndDrag={() => { pendingDrop.current = null; }} />}
              {turn.role === "assistant" && !turn.proposal && index === turns.length - 1 && !busy && <button type="button" className="flex items-center gap-1 text-xs text-muted hover:text-foreground" onClick={() => { const generation = lastGeneration.current; if (generation) { setTurns((previous) => previous.slice(0, -1)); void send(generation); } }}><RotateCcw className="h-3 w-3" />Regenerate</button>}
            </article>)}
            {busy && <p role="status" className="flex items-center gap-2 text-muted"><LoaderCircle className="h-4 w-4 animate-spin" />ReasonAI is thinking…</p>}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="shrink-0 space-y-2 border-t border-border bg-surface p-3">
            {error && <div className="space-y-1"><p role="alert" className="text-xs text-danger">{error}</p><button type="button" disabled={busy} className="text-xs text-accent" onClick={() => { if (lastGeneration.current) void send(lastGeneration.current); }}>Retry</button></div>}
            <div className="flex gap-1" role="group" aria-label="ReasonAI mode">{(Object.entries(REASONAI_MODES) as [ReasonAIMode, string][]).map(([value, label]) => <button key={value} type="button" disabled={busy} aria-pressed={mode === value} onClick={() => setMode(value)} className={`rounded-full px-3 py-1 text-xs ${mode === value ? "bg-accent/15 text-accent" : "text-muted hover:bg-background"}`}>{label}</button>)}</div>
            <div className="flex items-center justify-between text-xs text-muted"><span>{selected ? `${selected} selected · ` : ""}Active diagram: {diagram.name}</span><span>{message.length}/4000</span></div>
            <div className="rounded-2xl border border-border bg-background p-2 focus-within:border-accent"><textarea ref={input} aria-label="Message ReasonAI" value={message} maxLength={4000} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy) void send(); } }} placeholder="Ask ReasonAI about this architecture…" rows={2} className="w-full resize-none bg-transparent p-1 text-sm outline-none" /><div className="flex items-center justify-between"><span className="text-[10px] text-muted">Enter to send · Shift+Enter for a new line</span>{busy ? <button type="button" aria-label="Stop generating" title="Stop generating" className={buttonClass} onClick={() => pending.current?.abort()}><Square className="h-4 w-4" /></button> : <button type="submit" aria-label="Send to ReasonAI" title="Send" disabled={!message.trim()} className="rounded-full bg-accent p-2 text-background disabled:opacity-40"><ArrowUp className="h-4 w-4" /></button>}</div></div>
          </form>
        </section>
      )}
      <div className="pointer-events-auto absolute bottom-4 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col items-center gap-1 rounded-xl border border-border bg-surface/95 px-3 py-2 shadow-xl backdrop-blur">
        <button ref={launcher} type="button" aria-label="Open ReasonAI" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex items-center gap-3 whitespace-nowrap text-xs text-muted hover:text-foreground"><Sparkles className="h-4 w-4 text-accent" /><span>Ask ReasonAI about this design…</span><kbd className="rounded border border-border px-1">⌘K</kbd></button>
        <div className="flex gap-4 text-[11px] text-muted"><button type="button" disabled={busy} onClick={() => quick("chat", "Explain")} className="hover:text-foreground">Explain</button><button type="button" disabled={busy} onClick={() => quick("review", "Find issues in")} className="hover:text-foreground">Find issues</button><button type="button" disabled={busy} onClick={() => quick("fix", "Improve")} className="hover:text-foreground">Improve</button></div>
      </div>
    </div>
  );
}
