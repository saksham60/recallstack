export interface SystemDesignPerformanceSnapshot {
  canvasRenders: number;
  nodeRenders: number;
  edgeRenders: number;
  dragFrames: number;
  edgeGeometryUpdates: number;
  documentCommits: number;
  persistenceWrites: number;
  lastDragDurationMs: number;
  lastDragNodeCount: number;
  lastDragCanvasRenders: number;
  lastDragNodeRenders: number;
  lastDragEdgeRenders: number;
  lastDragDocumentCommits: number;
  lastDragPersistenceWrites: number;
  maxEdgesUpdatedInFrame: number;
}

type RenderKind = "canvas" | "node" | "edge";

const snapshot: SystemDesignPerformanceSnapshot = {
  canvasRenders: 0,
  nodeRenders: 0,
  edgeRenders: 0,
  dragFrames: 0,
  edgeGeometryUpdates: 0,
  documentCommits: 0,
  persistenceWrites: 0,
  lastDragDurationMs: 0,
  lastDragNodeCount: 0,
  lastDragCanvasRenders: 0,
  lastDragNodeRenders: 0,
  lastDragEdgeRenders: 0,
  lastDragDocumentCommits: 0,
  lastDragPersistenceWrites: 0,
  maxEdgesUpdatedInFrame: 0,
};

let dragStartedAt: number | null = null;
let dragFinishRequested = false;
let dragFinishTimer: number | null = null;
let publishScheduled = false;
let instrumentationEnabled: boolean | null = null;
let dragBaseline: Pick<
  SystemDesignPerformanceSnapshot,
  | "canvasRenders"
  | "nodeRenders"
  | "edgeRenders"
  | "documentCommits"
  | "persistenceWrites"
> | null = null;

function isInstrumentationEnabled(): boolean {
  if (
    process.env.NODE_ENV === "production" ||
    typeof window === "undefined"
  ) {
    return false;
  }
  instrumentationEnabled ??=
    new URLSearchParams(window.location.search).get("sdPerf") === "1";
  return instrumentationEnabled;
}

function publish(): void {
  if (!isInstrumentationEnabled()) return;
  window.__RECALLSTACK_SYSTEM_DESIGN_PERF__ = {
    ...snapshot,
  };
  window.dispatchEvent(
    new CustomEvent("recallstack:system-design-performance", {
      detail: window.__RECALLSTACK_SYSTEM_DESIGN_PERF__,
    }),
  );
}

function schedulePublish(): void {
  if (
    publishScheduled ||
    !isInstrumentationEnabled()
  ) {
    return;
  }
  publishScheduled = true;
  queueMicrotask(() => {
    publishScheduled = false;
    publish();
  });
}

export function recordSystemDesignRender(kind: RenderKind): void {
  if (!isInstrumentationEnabled()) return;
  if (kind === "canvas") snapshot.canvasRenders += 1;
  if (kind === "node") snapshot.nodeRenders += 1;
  if (kind === "edge") snapshot.edgeRenders += 1;
  // Render instrumentation is intentionally published after the render stack
  // completes so diagnostics never trigger a sibling update during render.
  schedulePublish();
}

export function startSystemDesignDragMeasurement(nodeCount = 1): void {
  if (!isInstrumentationEnabled()) return;
  if (dragFinishTimer !== null) window.clearTimeout(dragFinishTimer);
  dragFinishTimer = null;
  dragFinishRequested = false;
  dragStartedAt = performance.now();
  dragBaseline = {
    canvasRenders: snapshot.canvasRenders,
    nodeRenders: snapshot.nodeRenders,
    edgeRenders: snapshot.edgeRenders,
    documentCommits: snapshot.documentCommits,
    persistenceWrites: snapshot.persistenceWrites,
  };
  snapshot.lastDragNodeCount = nodeCount;
  snapshot.lastDragCanvasRenders = 0;
  snapshot.lastDragNodeRenders = 0;
  snapshot.lastDragEdgeRenders = 0;
  snapshot.lastDragDocumentCommits = 0;
  snapshot.lastDragPersistenceWrites = 0;
  snapshot.maxEdgesUpdatedInFrame = 0;
}

export function recordSystemDesignDragFrame(
  updatedEdgeCount: number,
): void {
  if (!isInstrumentationEnabled()) return;
  snapshot.dragFrames += 1;
  snapshot.edgeGeometryUpdates += updatedEdgeCount;
  snapshot.maxEdgesUpdatedInFrame = Math.max(
    snapshot.maxEdgesUpdatedInFrame,
    updatedEdgeCount,
  );
  if (dragBaseline) {
    snapshot.lastDragCanvasRenders =
      snapshot.canvasRenders - dragBaseline.canvasRenders;
    snapshot.lastDragNodeRenders =
      snapshot.nodeRenders - dragBaseline.nodeRenders;
    snapshot.lastDragEdgeRenders =
      snapshot.edgeRenders - dragBaseline.edgeRenders;
  }
  publish();
}

export function recordSystemDesignDocumentCommit(): void {
  if (!isInstrumentationEnabled()) return;
  snapshot.documentCommits += 1;
  if (dragStartedAt !== null && dragFinishRequested) {
    finishSystemDesignDragMeasurement();
    return;
  }
  publish();
}

export function recordSystemDesignPersistenceWrite(): void {
  if (!isInstrumentationEnabled()) return;
  snapshot.persistenceWrites += 1;
  publish();
}

export function finishSystemDesignDragMeasurement(): void {
  if (
    !isInstrumentationEnabled() ||
    dragStartedAt === null
  ) {
    return;
  }
  snapshot.lastDragDurationMs = performance.now() - dragStartedAt;
  if (dragBaseline) {
    snapshot.lastDragDocumentCommits =
      snapshot.documentCommits - dragBaseline.documentCommits;
    snapshot.lastDragPersistenceWrites =
      snapshot.persistenceWrites - dragBaseline.persistenceWrites;
  }
  dragStartedAt = null;
  dragFinishRequested = false;
  if (dragFinishTimer !== null) {
    window.clearTimeout(dragFinishTimer);
    dragFinishTimer = null;
  }
  dragBaseline = null;
  publish();
}

export function requestSystemDesignDragMeasurementFinish(): void {
  if (!isInstrumentationEnabled() || dragStartedAt === null) return;
  dragFinishRequested = true;
  if (dragFinishTimer !== null) window.clearTimeout(dragFinishTimer);
  // A no-op drag does not create a document commit, so retain a short fallback.
  dragFinishTimer = window.setTimeout(
    finishSystemDesignDragMeasurement,
    100,
  );
}

declare global {
  interface Window {
    __RECALLSTACK_SYSTEM_DESIGN_PERF__?: SystemDesignPerformanceSnapshot;
  }
}
