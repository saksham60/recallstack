"use client";

import { useMemo, useRef, useState } from "react";
import { Check, GripVertical, Undo2 } from "lucide-react";
import {
  editorGhostButtonClass,
  editorSecondaryButtonClass,
} from "../components/SystemDesignUiPrimitives";
import { SystemDesignNodeIcon } from "../components/SystemDesignIcons";
import { getSystemDesignNodeDefinition } from "../constants/system-design-palette";
import type { SystemDesignDiagram, SystemDesignPoint } from "../types/system-design.types";
import { parseReasonAIProposal, type ReasonAIOperation, type ReasonAIProposal } from "./contract";
import { createReasonAIVisibleTextNormalizer } from "./visible-text";
import { REASONAI_NODE_DRAG_MIME, reasonAIActionStatus, resolveReasonAISuggestion, type ReasonAIAction, type ReasonAIRefs } from "./suggestions";

export interface ReasonAISuggestionActions {
  onCommit: (op: ReasonAIOperation, refs: ReasonAIRefs, position?: SystemDesignPoint) => ReasonAIAction;
  onUndo: (action: ReasonAIAction) => void;
  undoUnavailable: (action: ReasonAIAction) => string | null;
}
interface SuggestionState { dismissed?: boolean; dragging?: boolean; action?: ReasonAIAction; error?: string }

export function ReasonAISuggestions({ proposal, diagram, canApply, live, onCommit, onUndo, undoUnavailable, onStartDrag, onEndDrag }: ReasonAISuggestionActions & {
  proposal: ReasonAIProposal; diagram: SystemDesignDiagram; canApply: boolean; live: boolean;
  onStartDrag: (token: string, drop: (position: SystemDesignPoint) => void) => void;
  onEndDrag: () => void;
}) {
  const [states, setStates] = useState<Record<number, SuggestionState>>({});
  const current = useRef(states);
  const [refs, setRefs] = useState(new Map<string, string>());
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const { nodes, edges } = diagram;
  // Local validation needs no network redaction; share the snapshot across all cards.
  const validationContext = useMemo(() => {
    if (nodes.length > 200 || edges.length > 400) return null;
    return { nodes: nodes.map((node) => ({ ...node, technology: node.technology?.name })), edges };
  }, [nodes, edges]);
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const edgesById = useMemo(() => new Map(edges.map((edge) => [edge.id, edge])), [edges]);
  const proposedNodes = useMemo(() => new Map(proposal.operations.flatMap((op) => op.op === "add_node" ? [[op.ref, op] as const] : [])), [proposal]);
  function update(index: number, patch: Partial<SuggestionState>) {
    current.current = { ...current.current, [index]: { ...current.current[index], ...patch } };
    setStates(current.current);
  }
  const clean = useMemo(() => createReasonAIVisibleTextNormalizer({ nodes, edges }, proposal), [nodes, edges, proposal]);
  const nodeName = (id: string) => {
    return nodesById.get(refs.get(id) ?? id)?.label ?? proposedNodes.get(id)?.label ?? "Component";
  };
  const edgeName = (id: string) => { const edge = edgesById.get(id); return edge ? `${nodeName(edge.sourceNodeId)} → ${nodeName(edge.targetNodeId)}` : "Connection"; };
  function unavailable(op: ReasonAIOperation): string | null {
    if (!canApply) return "Return to edit mode and connect to the live session to make changes.";
    if (op.op === "add_edge" || op.op === "update_edge") {
      const missing = [op.sourceNodeId, op.targetNodeId].filter((id): id is string => Boolean(id?.startsWith("new:") && !nodesById.has(refs.get(id!) ?? "")));
      if (missing.length) return clean(`Waiting for ${missing.map(nodeName).join(" and ")} to be added`);
    }
    try {
      const resolved = resolveReasonAISuggestion(op, refs);
      if (!validationContext) return "Unavailable: this canvas exceeds the supported proposal size.";
      parseReasonAIProposal({ summary: "Suggestion", operations: [resolved] }, validationContext);
      if ("nodeId" in op && nodesById.get(op.nodeId)?.locked) return "Unlock this component first.";
      return null;
    } catch { return "Unavailable: the canvas has changed. Ask for an updated suggestion."; }
  }
  function apply(index: number, position?: SystemDesignPoint) {
    const op = proposal.operations[index], state = current.current[index];
    if (state?.dismissed || (state?.action && reasonAIActionStatus(state.action, diagram) !== "undone")) return;
    try {
      const action = onCommit(op, refs, position);
      if (op.op === "add_node" && action.operation.kind === "node.add") setRefs(new Map(refs).set(op.ref, action.operation.node.id));
      update(index, { action, dragging: false, error: undefined });
    } catch { update(index, { dragging: false, error: "Could not make this change. The canvas may have changed; check the components and try again." }); }
    setConfirmDelete(null);
  }
  return <div className="mt-3 space-y-2" aria-label="Suggested changes">
    {proposal.operations.map((op, index) => {
      const state = states[index] ?? {};
      const status = state.dismissed ? "dismissed" : state.action ? reasonAIActionStatus(state.action, diagram) : state.dragging ? "dragging" : "pending";
      const blocked = unavailable(op);
      const undoReason = state.action ? undoUnavailable(state.action) : null;
      const available = (status === "pending" || status === "undone" || status === "dragging") && !blocked;
      const title = clean(op.op === "add_node" ? op.label : op.op === "add_edge" ? `${nodeName(op.sourceNodeId)} → ${nodeName(op.targetNodeId)}` : op.op === "update_node" ? op.label ? `${nodeName(op.nodeId)} → ${op.label}` : `Update ${nodeName(op.nodeId)}` : op.op === "move_node" ? `Move ${nodeName(op.nodeId)}` : op.op === "delete_node" ? `Remove ${nodeName(op.nodeId)}` : op.op === "update_edge" ? `Update ${edgeName(op.edgeId)}` : `Remove ${edgeName(op.edgeId)}`);
      const done = op.op === "add_edge" ? "Connected" : op.op.startsWith("delete") ? "Deleted" : op.op === "add_node" ? "Added" : "Applied";
      return <section key={index} aria-label={`Suggestion: ${title}`} data-suggestion-status={status} className={`rounded-lg border px-3 py-2.5 text-sm transition ${status === "dragging" ? "border-accent/70 bg-accent/10" : status === "added" ? "border-transparent bg-transparent px-1 py-1.5" : "border-[var(--editor-border)] bg-background/30 hover:bg-background/50"}`}>
        {op.op === "add_node" ? <button type="button" draggable={available} disabled={!available} aria-label={`Drag ${title} to canvas`} title="Drag onto the canvas, or use Add to canvas below" className="flex w-full cursor-grab items-center gap-3 text-left active:cursor-grabbing disabled:cursor-default"
          onDragStart={(event) => {
            if (!available) { event.preventDefault(); return; }
            const token = crypto.randomUUID();
            event.dataTransfer.setData(REASONAI_NODE_DRAG_MIME, token);
            event.dataTransfer.effectAllowed = "copy";
            onStartDrag(token, (position) => apply(index, position));
            update(index, { dragging: true });
          }}
          onDragEnd={() => { onEndDrag(); update(index, { dragging: false }); }}
        ><SystemDesignNodeIcon type={op.type} className="h-6 w-6 shrink-0 text-accent" /><span className="min-w-0 flex-1"><span className="block font-semibold [overflow-wrap:anywhere]">{title}</span><span className="mt-1 block text-xs text-muted">{clean(`${getSystemDesignNodeDefinition(op.type).label}${op.technology ? ` · ${op.technology}` : ""}`)}</span></span><GripVertical className="h-4 w-4 shrink-0 text-muted" /></button> : <p className="font-medium [overflow-wrap:anywhere]">{title}</p>}
        {op.op === "add_node" && available && <p className="mt-2 text-xs text-muted">{status === "undone" ? "Addition undone. Drag to add again." : "Drag onto canvas"}</p>}
        {op.op === "add_edge" && (op.label || op.protocol) && <p className="mt-1 text-xs text-muted">{clean([op.label, op.protocol].filter(Boolean).join(" · "))}</p>}
        {op.op === "update_node" && <p className="mt-1 text-xs text-muted whitespace-pre-wrap">{clean([op.subtitle, op.technology, op.description].filter(Boolean).join(" · "))}</p>}
        {op.op === "update_edge" && <p className="mt-1 text-xs text-muted">{clean([op.label, op.protocol, op.type?.replaceAll("_", " "), op.sourceNodeId ? `From ${nodeName(op.sourceNodeId)}` : "", op.targetNodeId ? `To ${nodeName(op.targetNodeId)}` : ""].filter(Boolean).join(" · "))}</p>}
        {status === "added" ? <div className="space-y-1"><div className="flex items-center justify-between"><span className="flex items-center gap-1 text-xs text-success"><Check className="h-3 w-3" />{done}</span><button type="button" className={editorGhostButtonClass} disabled={!canApply || Boolean(undoReason)} onClick={() => { try { onUndo(state.action!); update(index, { error: undefined }); } catch { update(index, { error: "This action can no longer be undone safely." }); } }}><Undo2 className="h-3 w-3" />Undo</button></div>{undoReason && <p className="text-xs text-muted">{undoReason}</p>}</div>
          : status === "dismissed" || status === "unavailable" ? <p className="mt-2 text-xs text-muted">{status === "dismissed" ? "Dismissed" : "Unavailable: this component or connection has changed."}</p>
            : <div className="mt-3 space-y-2">
              {blocked && <p className="text-xs text-muted">{blocked}</p>}
              {status === "undone" && op.op !== "add_node" && <p className="text-xs text-muted">Undone</p>}
              {confirmDelete === index ? <div className="space-y-2"><p className="text-xs text-muted">{op.op === "delete_node" ? `Remove this component and its connections${live && diagram.nodes.find((n) => n.id === op.nodeId)?.childDiagramId ? " and nested contents? This deletion cannot be undone in live mode." : "?"}` : "Remove this connection?"}</p><div className="flex gap-2"><button type="button" className={editorSecondaryButtonClass} disabled={!available} onClick={() => apply(index)}>Confirm delete</button><button type="button" className={editorGhostButtonClass} onClick={() => setConfirmDelete(null)}>Cancel</button></div></div> : <div className="flex flex-wrap gap-2"><button type="button" className={editorSecondaryButtonClass} disabled={!available} onClick={() => op.op.startsWith("delete") ? setConfirmDelete(index) : apply(index)}>{op.op === "add_node" ? status === "undone" ? "Add again" : "Add to canvas" : op.op === "add_edge" ? "Connect" : op.op.startsWith("delete") ? "Delete" : "Apply"}</button><button type="button" className={editorGhostButtonClass} onClick={() => update(index, { dismissed: true, dragging: false })}>Dismiss</button></div>}
            </div>}
        {state.error && <p role="alert" className="mt-2 text-xs text-danger">{state.error}</p>}
      </section>;
    })}
  </div>;
}
