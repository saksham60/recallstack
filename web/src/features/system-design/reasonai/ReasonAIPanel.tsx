"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  ArrowUp,
  GripHorizontal,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { buttonClass } from "@/features/admin/components/AdminPrimitives";
import type { SystemDesignDiagram, SystemDesignPoint, SystemDesignProblem } from "../types/system-design.types";
import { buildReasonAIContext, record, REASONAI_INVALID_PROPOSAL, REASONAI_MODES, type ReasonAIMessage, type ReasonAIMode, type ReasonAIProposal } from "./contract";
import { parseSanitizedAIProposal, REASONAI_CANVAS_UPDATE_FAILED } from "./sanitizeAIProposal";
import { normalizeReasonAIVisibleText } from "./visible-text";
import { ReasonAISuggestions, type ReasonAISuggestionActions } from "./ReasonAISuggestions";
import { parseReasonAISources, type ReasonAISource } from "./sources";
import { ReasonAISources } from "./ReasonAISources";
import { parseReasonAIVisualization, reasonAIAnalysisScope, type ReasonAIVisualization } from "./visualization";
import { cancelReasonAIRun, fetchReasonAIStreamResponse } from "@/lib/reasonai/client";
import { createReasonAIRuntimeState, interruptReasonAIRun, reduceReasonAIEvent } from "@/lib/reasonai/runtime/reducer";
import { decodeReasonAIEventResponse } from "@/lib/reasonai/streaming-client";
import { systemDesignRuntimeResponse, type SystemDesignToolActivity } from "./runtime-client";

import { createReasonAITrace, REASONAI_SUGGESTIONS_UNAVAILABLE } from "./trace";

interface Turn extends ReasonAIMessage { id: string; proposal?: ReasonAIProposal; sources?: ReasonAISource[]; notice?: string; tools?: SystemDesignToolActivity[]; diagramId?: string; traceId?: string; suggestionsUnavailable?: boolean }
interface Generation { question: string; mode: ReasonAIMode; history: ReasonAIMessage[] }
export interface ReasonAIPanelHandle { dropSuggestion: (token: string, position: SystemDesignPoint) => void }

interface PanelPosition {
  x: number;
  y: number;
}

function constrainPanelPosition(
  position: PanelPosition,
  container: HTMLElement,
  panel: HTMLElement,
): PanelPosition {
  const inset = 8;
  return {
    x: Math.max(
      inset,
      Math.min(position.x, container.clientWidth - panel.offsetWidth - inset),
    ),
    y: Math.max(
      inset,
      Math.min(position.y, container.clientHeight - panel.offsetHeight - inset),
    ),
  };
}
export function ReasonAIPanel({
  ref,
  diagram,
  title,
  problem,
  selectedNodeIds,
  selectedEdgeIds,
  canApply,
  live,
  onCommit,
  onUndo,
  undoUnavailable,
  open: controlledOpen,
  onOpenChange,
  onVisualization,
  onClearAnalysis,
}: ReasonAISuggestionActions & {
  ref?: Ref<ReasonAIPanelHandle>;
  diagram: SystemDesignDiagram;
  title: string;
  problem?: SystemDesignProblem;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  canApply: boolean;
  live: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onVisualization?: (visualization: ReasonAIVisualization, scope: string) => void;
  onClearAnalysis?: () => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const openRef = useRef(open);
  const [mode, setMode] = useState<ReasonAIMode>("chat");
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const pending = useRef<AbortController | null>(null);
  const conversationId = useRef<string | undefined>(undefined);
  const conversationDiagramId = useRef<string | undefined>(undefined);
  const activeRun = useRef<{ conversationId: string; runId: string } | undefined>(undefined);
  const lastGeneration = useRef<Generation | null>(null);
  const pendingDrop = useRef<{
    token: string;
    drop: (position: SystemDesignPoint) => void;
  } | null>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);

  const setPanelOpen = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      const value = typeof next === "function" ? next(openRef.current) : next;
      openRef.current = value;
      setInternalOpen(value);
      onOpenChange?.(value);
    },
    [onOpenChange],
  );

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useImperativeHandle(
    ref,
    () => ({
      dropSuggestion(token, point) {
        const suggestion = pendingDrop.current;
        pendingDrop.current = null;
        if (canApply && suggestion?.token === token) suggestion.drop(point);
      },
    }),
    [canApply],
  );

  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setPanelOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", shortcut, true);
    return () => window.removeEventListener("keydown", shortcut, true);
  }, [setPanelOpen]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    const dialog = panel.current;
    const container = dialog?.parentElement;
    if (!open || !dialog || !container) return;

    const observer = new ResizeObserver(() => {
      setPosition((current) =>
        current
          ? constrainPanelPosition(current, container, dialog)
          : current,
      );
    });
    observer.observe(container);
    observer.observe(dialog);
    return () => {
      observer.disconnect();
      drag.current = null;
    };
  }, [open]);

  useEffect(() => {
    const container = scroll.current;
    const reply = container?.querySelector<HTMLElement>("article:last-of-type");
    if (!container) return;
    const top =
      !busy && reply
        ? container.scrollTop +
          reply.getBoundingClientRect().top -
          container.getBoundingClientRect().top -
          16
        : container.scrollHeight;
    container.scrollTo({ top });
  }, [turns, busy]);

  const close = () => {
    setPanelOpen(false);
    requestAnimationFrame(() => launcher.current?.focus());
  };
  const selected = selectedNodeIds.length + selectedEdgeIds.length;

  function quick(nextMode: ReasonAIMode, prompt: string) {
    setMode(nextMode);
    setMessage(
      `${prompt} ${selected ? "the selected components and connections" : "this architecture"}.`,
    );
    setPanelOpen(true);
    requestAnimationFrame(() => input.current?.focus());
  }

  async function send(retry?: Generation, explicitQuestion?: string) {
    const question = explicitQuestion ?? message.trim();
    if (pending.current || (!retry && !question)) return;
    setError(null);
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const armTimeout = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => controller.abort(new DOMException("ReasonAI stream timeout.", "TimeoutError")), 65_000);
    };
    armTimeout();
    const generation =
      retry ??
      {
        question,
        mode,
        history: turns
          .slice(-10)
          .map(({ role, content }) => ({ role, content: content.slice(0, 8000) })),
      };
    lastGeneration.current = generation;
    if (!retry) {
      setTurns((previous) => [
        ...previous,
        { id: crypto.randomUUID(), role: "user", content: generation.question },
      ]);
      if (explicitQuestion === undefined) setMessage("");
    }
    try {
      const context = buildReasonAIContext(
        diagram,
        title,
        problem,
        selectedNodeIds,
        selectedEdgeIds,
      );
      const currentConversationId = conversationDiagramId.current === diagram.id ? conversationId.current : undefined;
      const response = await fetchReasonAIStreamResponse("/api/reasonai/chat", JSON.stringify({
          mode: generation.mode,
          message: generation.question,
          history: generation.history,
          context,
          ...(currentConversationId ? { conversationId: currentConversationId } : {}),
          idempotencyKey: crypto.randomUUID(),
        }), controller.signal);
      const headerTrace = response.headers.get("X-ReasonAI-Trace-Id") ?? "";
      const traceId = /^[a-f0-9-]{36}$/i.test(headerTrace) ? headerTrace : undefined;
      const trace = createReasonAITrace(traceId ?? "", true);
      trace("CLIENT_RESPONSE_RECEIVED", { status: response.ok ? "success" : "failed" });
      if (response.redirected || response.status === 401) {
        throw new Error("Sign in to use ReasonAI, then try again.");
      }
      const responseConversationId = response.headers.get("X-ReasonAI-Conversation-Id") ?? undefined;
      const responseRunId = response.headers.get("X-ReasonAI-Run-Id") ?? undefined;
      if (responseConversationId && /^[0-9a-f-]{36}$/i.test(responseConversationId)) {
        conversationId.current = responseConversationId;
        conversationDiagramId.current = diagram.id;
        if (responseRunId && /^[0-9a-f-]{36}$/i.test(responseRunId)) activeRun.current = { conversationId: responseConversationId, runId: responseRunId };
      }
      if (response.headers.get("content-type")?.toLowerCase().includes("application/x-ndjson")) {
        let runtime = createReasonAIRuntimeState();
        const assistantId = crypto.randomUUID();
        let finalText = "";
        for await (const event of decodeReasonAIEventResponse(response)) {
          if (pending.current !== controller) return;
          armTimeout();
          runtime = reduceReasonAIEvent(runtime, event);
          const next = systemDesignRuntimeResponse(runtime, context);
          if (!next) continue;
          finalText = next.text || finalText;
          if (event.type === "visual.ready" && next.visualization) {
            onVisualization?.(next.visualization, reasonAIAnalysisScope(diagram));
          }
          const content = normalizeReasonAIVisibleText(next.text, context, next.proposal);
          setTurns((previous) => {
            const turn: Turn = {
              id: assistantId,
              role: "assistant",
              content,
              proposal: next.proposal,
              sources: next.sources,
              notice: next.notice,
              tools: next.tools,
              diagramId: diagram.id,
              traceId,
              suggestionsUnavailable: next.notice?.includes(REASONAI_SUGGESTIONS_UNAVAILABLE) ?? false,
            };
            const index = previous.findIndex((item) => item.id === assistantId);
            if (index < 0) return [...previous, turn];
            const updated = previous.slice();
            updated[index] = turn;
            return updated;
          });
        }
        runtime = interruptReasonAIRun(runtime);
        if (runtime.status === "failed") throw new Error(runtime.error?.message ?? "ReasonAI is unavailable. Please try again.");
        if (runtime.status === "cancelled") throw new DOMException("Response stopped.", "AbortError");
        if (runtime.status !== "completed" || !finalText) throw new Error("ReasonAI stream ended before the answer completed. Please try again.");
        return;
      }
      let data;
      try {
        data = record(await response.json());
      } catch {
        throw new Error("ReasonAI could not complete that response. Please try again.");
      }
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error === REASONAI_INVALID_PROPOSAL ? REASONAI_CANVAS_UPDATE_FAILED : data.error
            : "ReasonAI is unavailable. Please try again.",
        );
      }
      if (typeof data.text !== "string" || data.text.length > 16_000) {
        throw new Error("ReasonAI returned an invalid response. Please try again.");
      }
      let proposal: ReasonAIProposal | undefined;
      let notice = typeof data.notice === "string" ? data.notice.slice(0, 1000) : undefined;
      let suggestionsUnavailable = notice?.includes(REASONAI_SUGGESTIONS_UNAVAILABLE) ?? false;
      try {
        if (data.proposal) trace("CLIENT_PROPOSAL_VALIDATE", { status: "started" });
        proposal = data.proposal
          ? parseSanitizedAIProposal(data.proposal, context)
          : undefined;
      } catch {
        notice = [notice, REASONAI_SUGGESTIONS_UNAVAILABLE].filter(Boolean).join(" ");
        suggestionsUnavailable = true;
        trace("CLIENT_PROPOSAL_REJECTED", { status: "failed", errorCode: "INVALID_PROPOSAL" });
      }
      if (proposal) trace("SUGGESTIONS_RENDERED", { status: "success", operationCount: proposal.operations.length });
      const content = normalizeReasonAIVisibleText(data.text, context, proposal);
      if (pending.current !== controller) return;
      const sources = parseReasonAISources(data.sources);
      if (data.visualization) {
        try { onVisualization?.(parseReasonAIVisualization(data.visualization, context, sources.map((source) => source.id)), reasonAIAnalysisScope(diagram)); }
        catch { notice = [notice, "The analysis overlay could not be displayed. Your architecture is unchanged."].filter(Boolean).join(" "); }
      }
      setTurns((previous) => [
        ...previous,
        { id: crypto.randomUUID(), role: "assistant", content, proposal, sources, notice, diagramId: diagram.id, traceId, suggestionsUnavailable },
      ]);
    } catch (error) {
      if (pending.current === controller) {
        setError(
          controller.signal.aborted
            ? "Request cancelled or timed out. You can try again."
            : error instanceof Error
              ? error.message
              : "ReasonAI is unavailable. Please try again.",
        );
      }
    } finally {
      if (timeout) clearTimeout(timeout);
      if (pending.current === controller) {
        pending.current = null;
        activeRun.current = undefined;
        setBusy(false);
      }
    }
  }

  function clearConversation() {
    onClearAnalysis?.();
    const run = activeRun.current;
    pending.current?.abort();
    pending.current = null;
    activeRun.current = undefined;
    conversationId.current = undefined;
    conversationDiagramId.current = undefined;
    pendingDrop.current = null;
    lastGeneration.current = null;
    setTurns([]);
    setMessage("");
    setError(null);
    setBusy(false);
    if (run) void cancelReasonAIRun(run.conversationId, run.runId).catch(() => undefined);
  }

  const launcherControl = !open ? (
      <button
        ref={launcher}
        type="button"
        aria-label="Open ReasonAI"
        aria-expanded={false}
        onClick={() => setPanelOpen(true)}
        className="absolute bottom-3 left-1/2 z-20 flex h-9 max-w-[calc(100%-7rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--editor-border)] bg-[var(--editor-floating)] px-3 text-xs text-muted shadow-lg backdrop-blur transition hover:border-[var(--editor-border-strong)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <span className="truncate">Ask ReasonAI about this design…</span>
        <kbd className="rounded border border-[var(--editor-border)] px-1 text-[10px]">⌘K</kbd>
      </button>
    ) : null;

  return (
    <>
      {launcherControl}
      <aside
        ref={panel}
        role="dialog"
        aria-label="ReasonAI"
        style={
          position
            ? { left: position.x, top: position.y }
            : { right: 56, top: 16 }
        }
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
        className={`${open ? "flex" : "hidden"} absolute z-40 h-[min(620px,calc(100%-2rem))] max-h-[calc(100%-1rem)] min-h-[24rem] w-[380px] min-w-[320px] max-w-[calc(100%-1rem)] resize flex-col overflow-hidden rounded-xl border border-[var(--editor-border)] bg-surface shadow-2xl`}
      >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--editor-border)] px-3">
        <div
          role="button"
          tabIndex={0}
          aria-label="Move ReasonAI"
          title="Drag to move · Use arrow keys to reposition"
          className="min-w-0 flex-1 touch-none select-none rounded-sm cursor-grab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"
          onPointerDown={(event) => {
            const dialog = panel.current;
            const container = dialog?.parentElement;
            if (
              event.button !== 0 ||
              !event.isPrimary ||
              !dialog ||
              !container
            ) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.focus();
            const dialogBounds = dialog.getBoundingClientRect();
            const containerBounds = container.getBoundingClientRect();
            setPosition({
              x: dialogBounds.left - containerBounds.left,
              y: dialogBounds.top - containerBounds.top,
            });
            drag.current = {
              pointerId: event.pointerId,
              offsetX: event.clientX - dialogBounds.left,
              offsetY: event.clientY - dialogBounds.top,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const activeDrag = drag.current;
            const dialog = panel.current;
            const container = dialog?.parentElement;
            if (
              !activeDrag ||
              activeDrag.pointerId !== event.pointerId ||
              !dialog ||
              !container
            ) {
              return;
            }
            event.stopPropagation();
            const containerBounds = container.getBoundingClientRect();
            setPosition(
              constrainPanelPosition(
                {
                  x:
                    event.clientX -
                    containerBounds.left -
                    activeDrag.offsetX,
                  y:
                    event.clientY -
                    containerBounds.top -
                    activeDrag.offsetY,
                },
                container,
                dialog,
              ),
            );
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointerId !== event.pointerId) return;
            drag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onKeyDown={(event) => {
            const direction: Record<string, [number, number]> = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            };
            const delta = direction[event.key];
            const dialog = panel.current;
            const container = dialog?.parentElement;
            if (!delta || !dialog || !container) return;
            event.preventDefault();
            event.stopPropagation();
            const dialogBounds = dialog.getBoundingClientRect();
            const containerBounds = container.getBoundingClientRect();
            const step = event.shiftKey ? 48 : 16;
            setPosition(
              constrainPanelPosition(
                {
                  x:
                    dialogBounds.left -
                    containerBounds.left +
                    delta[0] * step,
                  y:
                    dialogBounds.top -
                    containerBounds.top +
                    delta[1] * step,
                },
                container,
                dialog,
              ),
            );
          }}
        >
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
            ReasonAI
            <GripHorizontal
              className="ml-auto h-3.5 w-3.5 text-muted/70"
              aria-hidden="true"
            />
          </h2>
          <p className="truncate text-[10px] text-muted">
            Private · Changes apply only when you choose
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Clear conversation"
          title="Clear conversation"
          onClick={clearConversation}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Close ReasonAI"
          title="Close ReasonAI"
          onClick={close}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div
        ref={scroll}
        role="log"
        aria-label="ReasonAI conversation"
        aria-busy={busy}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 text-sm"
      >
        {!turns.length && (
          <div className="mx-auto flex h-full max-w-sm flex-col justify-center py-8">
            <Sparkles className="mb-3 h-5 w-5 text-accent" aria-hidden="true" />
            <h3 className="text-base font-semibold tracking-tight">
              Reason through this architecture with me.
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              {diagram.nodes.length
                ? "Ask about tradeoffs, surface risks, or shape the next iteration."
                : "Start with a design goal, then build and refine it together."}
            </p>
            <div className="mt-5 space-y-1" aria-label="ReasonAI quick actions">
              <button
                type="button"
                aria-label="Explain"
                disabled={busy}
                onClick={() => quick("chat", "Explain")}
                className="flex w-full items-center rounded-md px-2 py-2 text-left text-xs text-muted transition hover:bg-background hover:text-foreground"
              >
                Explain architecture
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => quick("review", "Find issues in")}
                className="flex w-full items-center rounded-md px-2 py-2 text-left text-xs text-muted transition hover:bg-background hover:text-foreground"
              >
                Find issues
              </button>
              <button
                type="button"
                aria-label="Improve"
                disabled={busy}
                onClick={() => quick("fix", "Improve")}
                className="flex w-full items-center rounded-md px-2 py-2 text-left text-xs text-muted transition hover:bg-background hover:text-foreground"
              >
                Improve design
              </button>
            </div>
          </div>
        )}

        {turns.map((turn, index) => (
          <article
            key={turn.id}
            data-trace-id={turn.traceId}
            className={
              turn.role === "user"
                ? "ml-8 space-y-2 rounded-xl bg-background/70 px-3 py-2.5"
                : "space-y-3"
            }
          >
            <p className="flex items-center gap-2 text-[11px] font-semibold text-muted">
              {turn.role === "assistant" && (
                <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              )}
              {turn.role === "user" ? "You" : "ReasonAI"}
            </p>
            {turn.role === "assistant" && turn.tools?.map((tool) => (
              <div key={tool.toolCallId} className="text-xs text-muted">
                {tool.toolName === "search_web" ? "🔎 " : tool.toolName === "show_architecture_analysis" ? "◈ " : tool.toolName === "propose_canvas_changes" ? "◇ " : "• "}
                {tool.summary}
              </div>
            ))}
            <p className="max-w-[65ch] whitespace-pre-wrap break-words leading-6 [overflow-wrap:anywhere]">
              {turn.content}
            </p>
            {turn.proposal && (
              <ReasonAISuggestions
                proposal={turn.proposal}
                traceId={turn.traceId}
                diagram={diagram}
                canApply={canApply}
                live={live}
                onCommit={onCommit}
                onUndo={onUndo}
                undoUnavailable={undoUnavailable}
                onStartDrag={(token, drop) => {
                  pendingDrop.current = { token, drop };
                }}
                onEndDrag={() => {
                  pendingDrop.current = null;
                }}
              />
            )}
            {turn.notice && <p className="text-xs leading-5 text-warning">{turn.notice}</p>}
            {!!turn.sources?.length && <ReasonAISources sources={turn.sources} />}
            {turn.role === "assistant" &&
              !turn.proposal &&
              index === turns.length - 1 &&
              !busy && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {turn.diagramId === diagram.id && diagram.nodes.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-accent hover:underline"
                      onClick={() => void send(undefined, "Propose the highest-impact actionable changes from the previous analysis as canvas suggestion cards.")}
                    >
                      {turn.suggestionsUnavailable ? "Retry suggestions" : "Create suggested changes"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted hover:text-foreground"
                    onClick={() => {
                      const generation = lastGeneration.current;
                      if (generation) {
                        setTurns((previous) => previous.slice(0, -1));
                        void send(generation);
                      }
                    }}
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    Regenerate
                  </button>
                </div>
              )}
          </article>
        ))}
        {busy && (
          <p role="status" className="flex items-center gap-2 text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ReasonAI is thinking…
          </p>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="shrink-0 space-y-2 border-t border-[var(--editor-border)] bg-surface p-3"
      >
        {error && (
          <div className="space-y-1">
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
            <button
              type="button"
              disabled={busy}
              className="text-xs text-accent"
              onClick={() => {
                if (lastGeneration.current) void send(lastGeneration.current);
              }}
            >
              Retry
            </button>
          </div>
        )}
        <div className="flex gap-1" role="group" aria-label="ReasonAI mode">
          {(Object.entries(REASONAI_MODES) as [ReasonAIMode, string][]).map(
            ([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={busy}
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={`rounded-md px-2.5 py-1 text-xs transition ${mode === value ? "bg-background text-foreground" : "text-muted hover:text-foreground"}`}
              >
                {label}
              </button>
            ),
          )}
        </div>
        <details className="text-xs text-muted"><summary className="cursor-pointer py-1 hover:text-foreground">Visual analysis</summary><div className="grid grid-cols-2 gap-1 py-2">{[
          ["Show bottlenecks", "Show bottlenecks in"], ["Simulate failure", "Simulate a hypothetical failure affecting"],
          ["Capacity analysis", "Analyze capacity risks in"], ["Reliability analysis", "Show reliability risks in"],
        ].map(([label, prompt]) => <button key={label} type="button" disabled={busy} onClick={() => quick("chat", prompt)} className="rounded-md bg-background/50 px-2 py-2 text-left hover:text-accent disabled:opacity-40">{label}</button>)}</div></details>
        <div className="flex items-center justify-between text-[10px] text-muted">
          <span>
            {selected ? `${selected} selected · ` : ""}
            {diagram.name}
          </span>
          <span>{message.length}/4000</span>
        </div>
        <div className="rounded-xl border border-[var(--editor-border)] bg-background p-2 focus-within:border-[var(--editor-border-strong)] focus-within:ring-1 focus-within:ring-accent/50">
          <textarea
            ref={input}
            aria-label="Message ReasonAI"
            value={message}
            maxLength={4000}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                if (!busy) void send();
              }
            }}
            placeholder="Ask ReasonAI about this architecture…"
            rows={3}
            className="w-full resize-none bg-transparent p-1 text-sm leading-5 outline-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted">Enter to send</span>
            {busy ? (
              <button
                type="button"
                aria-label="Stop generating"
                title="Stop generating"
                className={buttonClass}
                onClick={() => {
                  const run = activeRun.current;
                  pending.current?.abort();
                  if (run) void cancelReasonAIRun(run.conversationId, run.runId).catch(() => undefined);
                }}
              >
                <Square className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="submit"
                aria-label="Send to ReasonAI"
                title="Send"
                disabled={!message.trim()}
                className="rounded-full bg-accent p-2 text-background transition disabled:opacity-40"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </form>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-1 right-1 h-2.5 w-2.5 border-b border-r border-muted/60"
      />
    </aside>
    </>
  );
}
