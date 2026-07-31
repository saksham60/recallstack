"use client";

import { useSyncExternalStore } from "react";
import type { SystemDesignPerformanceSnapshot } from "../utils/performance-instrumentation";

const subscribeToLocation = () => () => {};
const readPerformanceFlag = () =>
  process.env.NODE_ENV !== "production" &&
  new URLSearchParams(window.location.search).get("sdPerf") === "1";
const readServerPerformanceFlag = () => false;

function subscribeToPerformance(
  onStoreChange: () => void,
): () => void {
  window.addEventListener(
    "recallstack:system-design-performance",
    onStoreChange,
  );
  return () => {
    window.removeEventListener(
      "recallstack:system-design-performance",
      onStoreChange,
    );
  };
}

const readPerformanceSnapshot = () =>
  window.__RECALLSTACK_SYSTEM_DESIGN_PERF__ ?? null;
const readServerPerformanceSnapshot = () => null;

/**
 * Development-only diagnostics. Add `?sdPerf=1` to the editor URL to inspect
 * render and persistence behavior without attaching React DevTools.
 */
export function SystemDesignPerformancePanel() {
  const enabled = useSyncExternalStore(
    subscribeToLocation,
    readPerformanceFlag,
    readServerPerformanceFlag,
  );
  const snapshot = useSyncExternalStore<
    SystemDesignPerformanceSnapshot | null
  >(
    enabled ? subscribeToPerformance : subscribeToLocation,
    enabled ? readPerformanceSnapshot : readServerPerformanceSnapshot,
    readServerPerformanceSnapshot,
  );

  if (!enabled || !snapshot) return null;

  return (
    <aside
      data-testid="system-design-performance-panel"
      className="pointer-events-none absolute bottom-4 left-4 z-30 w-64 rounded-lg border border-border bg-surface/95 p-3 font-mono text-[10px] leading-4 text-muted shadow-2xl backdrop-blur"
      aria-label="System design performance diagnostics"
    >
      <p className="font-semibold text-foreground">Canvas diagnostics</p>
      <p>
        renders C/N/E: {snapshot.canvasRenders}/{snapshot.nodeRenders}/
        {snapshot.edgeRenders}
      </p>
      <p>
        drag frames / edge updates: {snapshot.dragFrames}/
        {snapshot.edgeGeometryUpdates}
      </p>
      <p>
        last drag: {snapshot.lastDragDurationMs.toFixed(1)}ms ·{" "}
        {snapshot.lastDragNodeCount} node(s)
      </p>
      <p>
        frame rerenders C/N/E: {snapshot.lastDragCanvasRenders}/
        {snapshot.lastDragNodeRenders}/{snapshot.lastDragEdgeRenders}
      </p>
      <p>
        drag commits / writes: {snapshot.lastDragDocumentCommits}/
        {snapshot.lastDragPersistenceWrites}
      </p>
      <p>
        commits / writes: {snapshot.documentCommits}/
        {snapshot.persistenceWrites}
      </p>
      <p>
        max connected edges/frame: {snapshot.maxEdgesUpdatedInFrame}
      </p>
    </aside>
  );
}
