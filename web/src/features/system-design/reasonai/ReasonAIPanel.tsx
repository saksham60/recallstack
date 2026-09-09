"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Sparkles, X } from "lucide-react";
import { buttonClass } from "@/features/admin/components/AdminPrimitives";
import type { SystemDesignDiagram, SystemDesignProblem } from "../types/system-design.types";
import { buildReasonAIContext, parseReasonAIProposal, record, REASONAI_INVALID_PROPOSAL, REASONAI_MODES, type ReasonAIMessage, type ReasonAIMode, type ReasonAIOperation, type ReasonAIProposal } from "./contract";
import { normalizeReasonAIVisibleText } from "./visible-text";

interface Turn extends ReasonAIMessage { proposal?: ReasonAIProposal; status?: "applied" | "discarded" }
function describe(op: ReasonAIOperation, diagram: SystemDesignDiagram, proposal: ReasonAIProposal): string {
  const node = (id: string) => {
    const added = proposal.operations.find((operation) => operation.op === "add_node" && operation.ref === id);
    return diagram.nodes.find((n) => n.id === id)?.label ?? (added?.op === "add_node" ? added.label : "Component");
  };
  const edge = (id: string) => { const e = diagram.edges.find((e) => e.id === id); return e ? `${node(e.sourceNodeId)} → ${node(e.targetNodeId)}` : "Connection"; };
  switch (op.op) {
    case "add_node": return `+ Add ${op.label} (${op.type})`;
    case "update_node": return `Update ${node(op.nodeId)}`;
    case "move_node": return `Move ${node(op.nodeId)} to (${op.x}, ${op.y})`;
    case "delete_node": return `Delete ${node(op.nodeId)} and its connections / nested diagrams`;
    case "add_edge": return `+ Connect ${node(op.sourceNodeId)} → ${node(op.targetNodeId)}`;
    case "update_edge": return `Update connection ${edge(op.edgeId)}`;
    case "delete_edge": return `Delete connection ${edge(op.edgeId)}`;
  }
}
export function ReasonAIPanel({ diagram, title, problem, selectedNodeIds, selectedEdgeIds, canApply, onApply }: {
  diagram: SystemDesignDiagram; title: string; problem?: SystemDesignProblem;
  selectedNodeIds: string[]; selectedEdgeIds: string[]; canApply: boolean;
  onApply: (proposal: ReasonAIProposal) => void;
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
  async function send() {
    if (pending.current || !message.trim()) return;
    setError(null);
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    const timeout = setTimeout(() => controller.abort(), 65_000);
    try {
      const context = buildReasonAIContext(diagram, title, problem, selectedNodeIds, selectedEdgeIds);
      const question = message.trim();
      const response = await fetch("/api/reasonai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ mode, message: question, history: turns.slice(-10).map(({ role, content }) => ({ role, content: content.slice(0, 8000) })), context }) });
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
      setTurns((previous) => [...previous, { role: "user", content: question }, { role: "assistant", content, proposal }]);
      setMessage("");
    } catch (error) {
      if (pending.current === controller) setError(controller.signal.aborted ? "Request cancelled or timed out. You can try again." : error instanceof Error ? error.message : "ReasonAI is unavailable. Please try again.");
    } finally { clearTimeout(timeout); pending.current = null; setBusy(false); }
  }
  function finish(index: number, status: "applied" | "discarded") {
    setError(null);
    try {
      if (status === "applied") onApply(turns[index].proposal!);
      setTurns((previous) => previous.map((turn, i) => i === index ? { ...turn, status } : turn));
    } catch { setError("Could not apply this proposal to the current canvas. No changes were applied. Check that its components are still present and unlocked."); }
  }
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {open && (
        <section role="dialog" aria-label="ReasonAI" onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); close(); } }} className="pointer-events-auto absolute bottom-20 left-1/2 flex max-h-[calc(100%-6rem)] w-[520px] max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div><h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-accent" />ReasonAI</h2><p className="mt-1 text-xs text-muted">Private conversation · Changes shared only after Apply</p></div>
            <button type="button" className={buttonClass} aria-label="Close ReasonAI" onClick={close}><X className="h-4 w-4" /></button>
          </header>
          <div className="flex gap-1 border-b border-border p-2" role="group" aria-label="ReasonAI mode">
            {(Object.entries(REASONAI_MODES) as [ReasonAIMode, string][]).map(([value, label]) => <button key={value} type="button" disabled={busy} aria-pressed={mode === value} onClick={() => setMode(value)} className={`${buttonClass} flex-1 ${mode === value ? "bg-accent/15 text-accent" : "text-muted"}`}>{label}</button>)}
          </div>
          <div ref={scroll} role="log" aria-label="ReasonAI conversation" className="min-h-24 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
            {!turns.length && <p className="text-muted">{diagram.nodes.length ? "Ask about tradeoffs, find issues, or propose improvements to your design." : "Start with a design goal, such as: Design a URL shortener for 100M users."}</p>}
            {turns.map((turn, index) => <article key={index} className="space-y-2">
              <p className="text-xs font-semibold text-muted">{turn.role === "user" ? "You" : "ReasonAI"}</p>
              <p className="whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">{turn.content}</p>
              {turn.proposal && <div className="space-y-3 rounded-lg border border-border bg-background/60 p-3">
                <h3 className="font-semibold">Proposed Changes</h3>
                {normalizeReasonAIVisibleText(turn.proposal.summary, diagram, turn.proposal) !== turn.content && <p className="whitespace-pre-wrap break-words leading-relaxed text-muted [overflow-wrap:anywhere]">{normalizeReasonAIVisibleText(turn.proposal.summary, diagram, turn.proposal)}</p>}
                <ul className="space-y-1 text-xs">{turn.proposal.operations.map((op, i) => <li key={i} className="break-words">{describe(op, diagram, turn.proposal!)}</li>)}</ul>
                {!turn.status ? <>
                  <details><summary className="cursor-pointer text-xs text-accent">Preview</summary><ol className="mt-2 space-y-2 text-xs">{turn.proposal.operations.map((op, i) => <li key={i}><p>{describe(op, diagram, turn.proposal!)}</p><pre className="mt-1 whitespace-pre-wrap break-all text-muted">{JSON.stringify(op, null, 2)}</pre></li>)}</ol></details>
                  <div className="flex gap-2"><button type="button" className={buttonClass} disabled={!canApply || busy} onClick={() => finish(index, "applied")}>Apply Changes</button><button type="button" className={buttonClass} onClick={() => finish(index, "discarded")}>Discard</button></div>
                  {!canApply && <p className="text-xs text-muted">Return to edit mode and connect to the live session to apply changes.</p>}
                </> : <p className="text-xs text-muted">{turn.status === "applied" ? "Applied to canvas" : "Proposal discarded"}</p>}
              </div>}
            </article>)}
            {busy && <p role="status" className="flex items-center gap-2 text-muted"><LoaderCircle className="h-4 w-4 animate-spin" />ReasonAI is thinking…</p>}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="space-y-2 border-t border-border p-3">
            {error && <p role="alert" className="text-xs text-danger">{error}</p>}
            <div className="flex items-center justify-between text-xs text-muted"><span>{selected ? `${selected} selected · ` : ""}Active diagram: {diagram.name}</span><span>{message.length}/4000</span></div>
            <textarea ref={input} aria-label="Message ReasonAI" value={message} maxLength={4000} disabled={busy} onChange={(event) => setMessage(event.target.value)} placeholder="Ask ReasonAI about this design…" rows={3} className="w-full resize-none rounded-md border border-border bg-background p-2 text-sm outline-none focus:border-accent" />
            <div className="flex justify-end gap-2">{busy && <button type="button" className={buttonClass} onClick={() => pending.current?.abort()}>Cancel</button>}<button type="submit" disabled={busy || !message.trim()} className={buttonClass}>Send to ReasonAI</button></div>
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
