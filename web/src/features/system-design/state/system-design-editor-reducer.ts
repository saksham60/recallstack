import type {
  SystemDesignClipboard,
  SystemDesignDocument,
  SystemDesignEdge,
  SystemDesignEditorState,
  SystemDesignLayerDirection,
  SystemDesignNode,
  SystemDesignPoint,
  SystemDesignSelectionMode,
  SystemDesignViewport,
} from "../types/system-design.types";
import {
  DEFAULT_SYSTEM_DESIGN_VIEWPORT,
  MAX_ZOOM,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  MIN_ZOOM,
  SYSTEM_DESIGN_HISTORY_LIMIT,
  SYSTEM_DESIGN_PASTE_OFFSET,
  cloneSystemDesignDocument,
  createSystemDesignId,
  createNextSystemDesignTimestamp,
  normalizeSystemDesignLayers,
} from "../utils/system-design-defaults";
import type {
  SystemDesignEditorAction,
  SystemDesignEdgePatch,
  SystemDesignNodePatch,
} from "./system-design-editor-actions";

export interface CreateSystemDesignEditorStateOptions {
  persisted?: boolean;
  loadStatus?: SystemDesignEditorState["loadStatus"];
}

export function createSystemDesignEditorState(
  document: SystemDesignDocument,
  options: CreateSystemDesignEditorStateOptions = {},
): SystemDesignEditorState {
  const persisted = options.persisted ?? false;
  return {
    problemId: document.problemId,
    document: cloneSystemDesignDocument(document),
    selectedNodeIds: [],
    selectedEdgeIds: [],
    clipboard: null,
    isDirty: false,
    isPreviewMode: false,
    history: [],
    future: [],
    loadStatus: options.loadStatus ?? "ready",
    loadError: null,
    saveStatus: persisted ? "saved" : "idle",
    saveError: null,
    lastSavedAt: persisted ? document.updatedAt : null,
    lastSavedDocumentUpdatedAt: document.updatedAt,
    savingDocumentUpdatedAt: null,
  };
}

export const createInitialSystemDesignEditorState =
  createSystemDesignEditorState;

function pushHistory(
  history: readonly SystemDesignDocument[],
  document: SystemDesignDocument,
): SystemDesignDocument[] {
  return [...history, document].slice(-SYSTEM_DESIGN_HISTORY_LIMIT);
}

function saveStatusForDocument(
  state: SystemDesignEditorState,
  document: SystemDesignDocument,
): Pick<SystemDesignEditorState, "isDirty" | "saveStatus"> {
  const isDirty =
    state.lastSavedDocumentUpdatedAt === null ||
    document.updatedAt !== state.lastSavedDocumentUpdatedAt;
  return {
    isDirty,
    saveStatus: isDirty
      ? "unsaved"
      : state.lastSavedAt
        ? "saved"
        : "idle",
  };
}

function commitDocument(
  state: SystemDesignEditorState,
  document: SystemDesignDocument,
  at: string,
  selection?: {
    selectedNodeIds?: string[];
    selectedEdgeIds?: string[];
  },
): SystemDesignEditorState {
  const nextDocument: SystemDesignDocument = {
    ...document,
    status: document.nodes.length === 0 ? "in_progress" : document.status,
    updatedAt: createNextSystemDesignTimestamp(
      state.document.updatedAt,
      at,
    ),
  };
  return {
    ...state,
    document: nextDocument,
    selectedNodeIds:
      selection?.selectedNodeIds ??
      state.selectedNodeIds.filter((id) =>
        nextDocument.nodes.some((node) => node.id === id),
      ),
    selectedEdgeIds:
      selection?.selectedEdgeIds ??
      state.selectedEdgeIds.filter((id) =>
        nextDocument.edges.some((edge) => edge.id === id),
      ),
    history: pushHistory(state.history, state.document),
    future: [],
    isDirty: true,
    saveStatus: "unsaved",
    saveError: null,
  };
}

function updateDocumentWithoutHistory(
  state: SystemDesignEditorState,
  document: SystemDesignDocument,
  at: string,
): SystemDesignEditorState {
  return {
    ...state,
    document: {
      ...document,
      updatedAt: createNextSystemDesignTimestamp(
        state.document.updatedAt,
        at,
      ),
    },
    isDirty: true,
    saveStatus: "unsaved",
    saveError: null,
  };
}

function applySelection(
  current: readonly string[],
  requested: readonly string[],
  mode: SystemDesignSelectionMode,
): string[] {
  const uniqueRequested = [...new Set(requested)];
  if (mode === "replace") return uniqueRequested;
  if (mode === "add") return [...new Set([...current, ...uniqueRequested])];
  const toggled = new Set(current);
  uniqueRequested.forEach((id) => {
    if (toggled.has(id)) toggled.delete(id);
    else toggled.add(id);
  });
  return [...toggled];
}

function isValidEdge(
  edge: SystemDesignEdge,
  nodes: readonly SystemDesignNode[],
  edges: readonly SystemDesignEdge[],
  ignoredEdgeId?: string,
): boolean {
  if (
    edge.sourceNodeId === edge.targetNodeId ||
    !nodes.some((node) => node.id === edge.sourceNodeId) ||
    !nodes.some((node) => node.id === edge.targetNodeId)
  ) {
    return false;
  }
  return !edges.some(
    (candidate) =>
      candidate.id !== ignoredEdgeId &&
      candidate.sourceNodeId === edge.sourceNodeId &&
      candidate.targetNodeId === edge.targetNodeId &&
      candidate.sourcePort === edge.sourcePort &&
      candidate.targetPort === edge.targetPort &&
      candidate.type === edge.type,
  );
}

function removeNodes(
  document: SystemDesignDocument,
  nodeIds: readonly string[],
): SystemDesignDocument | null {
  const requested = new Set(nodeIds);
  const removableIds = new Set(
    document.nodes
      .filter((node) => requested.has(node.id) && !node.locked)
      .map((node) => node.id),
  );
  if (removableIds.size === 0) return null;
  return {
    ...document,
    nodes: normalizeSystemDesignLayers(
      document.nodes.filter((node) => !removableIds.has(node.id)),
    ),
    edges: document.edges.filter(
      (edge) =>
        !removableIds.has(edge.sourceNodeId) &&
        !removableIds.has(edge.targetNodeId),
    ),
  };
}

function removeEdges(
  document: SystemDesignDocument,
  edgeIds: readonly string[],
): SystemDesignDocument | null {
  const requested = new Set(edgeIds);
  const edges = document.edges.filter((edge) => !requested.has(edge.id));
  return edges.length === document.edges.length
    ? null
    : { ...document, edges };
}

function nextAvailableId(
  preferred: string | undefined,
  prefix: string,
  usedIds: Set<string>,
): string {
  let id = preferred ?? createSystemDesignId(prefix);
  while (usedIds.has(id)) id = createSystemDesignId(prefix);
  usedIds.add(id);
  return id;
}

interface DuplicateResult {
  document: SystemDesignDocument;
  nodeIds: string[];
}

function duplicateElements(
  document: SystemDesignDocument,
  sourceNodes: readonly SystemDesignNode[],
  sourceEdges: readonly SystemDesignEdge[],
  offset: SystemDesignPoint,
  nodeIdMap: Readonly<Record<string, string>> | undefined,
  edgeIdMap: Readonly<Record<string, string>> | undefined,
): DuplicateResult | null {
  if (sourceNodes.length === 0) return null;
  const existingNodeIds = new Set(document.nodes.map((node) => node.id));
  const existingEdgeIds = new Set(document.edges.map((edge) => edge.id));
  const ids = new Map<string, string>();
  const startLayer =
    document.nodes.reduce((maximum, node) => Math.max(maximum, node.layer), -1) +
    1;

  const nodes = sourceNodes
    .slice()
    .sort((left, right) => left.layer - right.layer)
    .map((node, index) => {
      const id = nextAvailableId(
        nodeIdMap?.[node.id],
        "node",
        existingNodeIds,
      );
      ids.set(node.id, id);
      return {
        ...node,
        id,
        x: node.x + offset.x,
        y: node.y + offset.y,
        layer: startLayer + index,
        metadata: node.metadata ? { ...node.metadata } : undefined,
      };
    });

  const edges = sourceEdges.flatMap((edge) => {
    const sourceNodeId = ids.get(edge.sourceNodeId);
    const targetNodeId = ids.get(edge.targetNodeId);
    if (!sourceNodeId || !targetNodeId) return [];
    return [
      {
        ...edge,
        id: nextAvailableId(edgeIdMap?.[edge.id], "edge", existingEdgeIds),
        sourceNodeId,
        targetNodeId,
      },
    ];
  });

  return {
    document: {
      ...document,
      nodes: [...document.nodes, ...nodes],
      edges: [...document.edges, ...edges],
    },
    nodeIds: nodes.map((node) => node.id),
  };
}

function copySelectedNodes(
  state: SystemDesignEditorState,
): SystemDesignClipboard | null {
  const selected = new Set(state.selectedNodeIds);
  const nodes = state.document.nodes
    .filter((node) => selected.has(node.id))
    .map((node) => ({
      ...node,
      metadata: node.metadata ? { ...node.metadata } : undefined,
    }));
  if (nodes.length === 0) return null;
  return {
    nodes,
    edges: state.document.edges
      .filter(
        (edge) =>
          selected.has(edge.sourceNodeId) && selected.has(edge.targetNodeId),
      )
      .map((edge) => ({ ...edge })),
    pasteCount: 0,
  };
}

function reorderNode(
  nodes: readonly SystemDesignNode[],
  nodeId: string,
  direction: SystemDesignLayerDirection,
): SystemDesignNode[] | null {
  const ordered = normalizeSystemDesignLayers(nodes);
  const currentIndex = ordered.findIndex((node) => node.id === nodeId);
  if (currentIndex < 0) return null;
  let nextIndex = currentIndex;
  if (direction === "forward") {
    nextIndex = Math.min(ordered.length - 1, currentIndex + 1);
  } else if (direction === "backward") {
    nextIndex = Math.max(0, currentIndex - 1);
  } else if (direction === "front") {
    nextIndex = ordered.length - 1;
  } else {
    nextIndex = 0;
  }
  if (nextIndex === currentIndex) return null;
  const next = [...ordered];
  const [node] = next.splice(currentIndex, 1);
  next.splice(nextIndex, 0, node);
  return next.map((item, layer) => ({ ...item, layer }));
}

function isBlockedInPreview(action: SystemDesignEditorAction): boolean {
  return (
    action.type === "node/add" ||
    action.type === "node/update" ||
    action.type === "nodes/move" ||
    action.type === "node/resize" ||
    action.type === "nodes/delete" ||
    action.type === "edges/delete" ||
    action.type === "selection/delete" ||
    action.type === "nodes/duplicate" ||
    action.type === "edge/add" ||
    action.type === "edge/update" ||
    action.type === "clipboard/paste" ||
    action.type === "history/undo" ||
    action.type === "history/redo" ||
    action.type === "document/reset" ||
    action.type === "document/replace" ||
    action.type === "document/complete" ||
    action.type === "layer/reorder"
  );
}

function sanitizeNodePatch(
  changes: SystemDesignNodePatch,
): SystemDesignNodePatch {
  const sanitized: SystemDesignNodePatch = { ...changes };
  if (changes.metadata === undefined) delete sanitized.metadata;
  else if (changes.metadata) sanitized.metadata = { ...changes.metadata };
  if (changes.width === undefined) delete sanitized.width;
  else if (Number.isFinite(changes.width)) {
    sanitized.width = Math.max(MIN_NODE_WIDTH, changes.width);
  } else {
    delete sanitized.width;
  }
  if (changes.height === undefined) delete sanitized.height;
  else if (Number.isFinite(changes.height)) {
    sanitized.height = Math.max(MIN_NODE_HEIGHT, changes.height);
  } else {
    delete sanitized.height;
  }
  if (changes.x !== undefined && !Number.isFinite(changes.x)) {
    delete sanitized.x;
  }
  if (changes.y !== undefined && !Number.isFinite(changes.y)) {
    delete sanitized.y;
  }
  return sanitized;
}

function mergeEdge(
  edge: SystemDesignEdge,
  changes: SystemDesignEdgePatch,
): SystemDesignEdge {
  return { ...edge, ...changes, id: edge.id };
}

function clampViewport(viewport: SystemDesignViewport): SystemDesignViewport {
  return {
    x: Number.isFinite(viewport.x) ? viewport.x : 0,
    y: Number.isFinite(viewport.y) ? viewport.y : 0,
    zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom)),
  };
}

export function systemDesignEditorReducer(
  state: SystemDesignEditorState,
  action: SystemDesignEditorAction,
): SystemDesignEditorState {
  if (state.isPreviewMode && isBlockedInPreview(action)) return state;

  switch (action.type) {
    case "load/start":
      return {
        ...state,
        loadStatus: "loading",
        loadError: null,
      };

    case "load/success": {
      const loaded = createSystemDesignEditorState(action.document, {
        persisted: action.persisted,
        loadStatus: "ready",
      });
      return { ...loaded, isPreviewMode: state.isPreviewMode };
    }

    case "load/failure":
      return {
        ...state,
        loadStatus: "error",
        loadError: action.message,
      };

    case "node/add": {
      if (state.document.nodes.some((node) => node.id === action.node.id)) {
        return state;
      }
      const layer =
        state.document.nodes.reduce(
          (maximum, node) => Math.max(maximum, node.layer),
          -1,
        ) + 1;
      const node: SystemDesignNode = {
        ...action.node,
        x: Number.isFinite(action.node.x) ? action.node.x : 0,
        y: Number.isFinite(action.node.y) ? action.node.y : 0,
        width: Number.isFinite(action.node.width)
          ? Math.max(MIN_NODE_WIDTH, action.node.width)
          : MIN_NODE_WIDTH,
        height: Number.isFinite(action.node.height)
          ? Math.max(MIN_NODE_HEIGHT, action.node.height)
          : MIN_NODE_HEIGHT,
        layer,
        metadata: action.node.metadata
          ? { ...action.node.metadata }
          : undefined,
      };
      return commitDocument(
        state,
        {
          ...state.document,
          nodes: [...state.document.nodes, node],
        },
        action.at,
        { selectedNodeIds: [node.id], selectedEdgeIds: [] },
      );
    }

    case "node/update": {
      let changed = false;
      const nodes = state.document.nodes.map((node) => {
        if (node.id !== action.nodeId) return node;
        const patch = sanitizeNodePatch(action.changes);
        if (node.locked) {
          delete patch.x;
          delete patch.y;
          delete patch.width;
          delete patch.height;
        }
        if (Object.keys(patch).length === 0) return node;
        changed = true;
        return { ...node, ...patch, id: node.id };
      });
      if (!changed) return state;
      return commitDocument(
        state,
        { ...state.document, nodes },
        action.at,
      );
    }

    case "nodes/move": {
      let changed = false;
      const nodes = state.document.nodes.map((node) => {
        const position = action.positions[node.id];
        if (
          !position ||
          node.locked ||
          !Number.isFinite(position.x) ||
          !Number.isFinite(position.y) ||
          (position.x === node.x && position.y === node.y)
        ) {
          return node;
        }
        changed = true;
        return { ...node, x: position.x, y: position.y };
      });
      if (!changed) return state;
      return commitDocument(
        state,
        { ...state.document, nodes },
        action.at,
      );
    }

    case "node/resize": {
      const node = state.document.nodes.find(
        (candidate) => candidate.id === action.nodeId,
      );
      if (!node || node.locked) return state;
      const width = Math.max(MIN_NODE_WIDTH, action.size.width);
      const height = Math.max(MIN_NODE_HEIGHT, action.size.height);
      const x = action.position?.x ?? node.x;
      const y = action.position?.y ?? node.y;
      if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      ) {
        return state;
      }
      const nodes = state.document.nodes.map((candidate) =>
        candidate.id === node.id
          ? { ...candidate, width, height, x, y }
          : candidate,
      );
      return commitDocument(
        state,
        { ...state.document, nodes },
        action.at,
      );
    }

    case "nodes/delete": {
      const document = removeNodes(state.document, action.nodeIds);
      return document
        ? commitDocument(state, document, action.at)
        : state;
    }

    case "edges/delete": {
      const document = removeEdges(state.document, action.edgeIds);
      return document
        ? commitDocument(state, document, action.at)
        : state;
    }

    case "selection/delete": {
      const withoutNodes = removeNodes(
        state.document,
        state.selectedNodeIds,
      );
      const base = withoutNodes ?? state.document;
      const withoutEdges = removeEdges(base, state.selectedEdgeIds);
      const document = withoutEdges ?? withoutNodes;
      return document
        ? commitDocument(state, document, action.at)
        : state;
    }

    case "nodes/duplicate": {
      const requested = new Set(
        action.nodeIds ?? state.selectedNodeIds,
      );
      const sourceNodes = state.document.nodes.filter((node) =>
        requested.has(node.id),
      );
      const sourceEdges = state.document.edges.filter(
        (edge) =>
          requested.has(edge.sourceNodeId) &&
          requested.has(edge.targetNodeId),
      );
      const result = duplicateElements(
        state.document,
        sourceNodes,
        sourceEdges,
        action.offset ?? {
          x: SYSTEM_DESIGN_PASTE_OFFSET,
          y: SYSTEM_DESIGN_PASTE_OFFSET,
        },
        action.nodeIdMap,
        action.edgeIdMap,
      );
      return result
        ? commitDocument(state, result.document, action.at, {
            selectedNodeIds: result.nodeIds,
            selectedEdgeIds: [],
          })
        : state;
    }

    case "edge/add": {
      if (
        state.document.edges.some((edge) => edge.id === action.edge.id) ||
        !isValidEdge(
          action.edge,
          state.document.nodes,
          state.document.edges,
        )
      ) {
        return state;
      }
      return commitDocument(
        state,
        {
          ...state.document,
          edges: [...state.document.edges, { ...action.edge }],
        },
        action.at,
        { selectedNodeIds: [], selectedEdgeIds: [action.edge.id] },
      );
    }

    case "edge/update": {
      const edge = state.document.edges.find(
        (candidate) => candidate.id === action.edgeId,
      );
      if (!edge) return state;
      const updated = mergeEdge(edge, action.changes);
      if (
        !isValidEdge(
          updated,
          state.document.nodes,
          state.document.edges,
          edge.id,
        )
      ) {
        return state;
      }
      return commitDocument(
        state,
        {
          ...state.document,
          edges: state.document.edges.map((candidate) =>
            candidate.id === edge.id ? updated : candidate,
          ),
        },
        action.at,
      );
    }

    case "selection/nodes": {
      const existing = new Set(
        state.document.nodes.map((node) => node.id),
      );
      const selectedNodeIds = applySelection(
        state.selectedNodeIds,
        action.nodeIds.filter((id) => existing.has(id)),
        action.mode,
      );
      return {
        ...state,
        selectedNodeIds,
        selectedEdgeIds:
          action.mode === "replace" ? [] : state.selectedEdgeIds,
      };
    }

    case "selection/edges": {
      const existing = new Set(
        state.document.edges.map((edge) => edge.id),
      );
      const selectedEdgeIds = applySelection(
        state.selectedEdgeIds,
        action.edgeIds.filter((id) => existing.has(id)),
        action.mode,
      );
      return {
        ...state,
        selectedNodeIds:
          action.mode === "replace" ? [] : state.selectedNodeIds,
        selectedEdgeIds,
      };
    }

    case "selection/clear":
      if (
        state.selectedNodeIds.length === 0 &&
        state.selectedEdgeIds.length === 0
      ) {
        return state;
      }
      return {
        ...state,
        selectedNodeIds: [],
        selectedEdgeIds: [],
      };

    case "clipboard/copy": {
      const clipboard = copySelectedNodes(state);
      return clipboard ? { ...state, clipboard } : state;
    }

    case "clipboard/paste": {
      if (!state.clipboard) return state;
      const multiplier = state.clipboard.pasteCount + 1;
      const offset = action.offset ?? {
        x: SYSTEM_DESIGN_PASTE_OFFSET * multiplier,
        y: SYSTEM_DESIGN_PASTE_OFFSET * multiplier,
      };
      const result = duplicateElements(
        state.document,
        state.clipboard.nodes,
        state.clipboard.edges,
        offset,
        action.nodeIdMap,
        action.edgeIdMap,
      );
      if (!result) return state;
      return {
        ...commitDocument(state, result.document, action.at, {
          selectedNodeIds: result.nodeIds,
          selectedEdgeIds: [],
        }),
        clipboard: {
          ...state.clipboard,
          pasteCount: multiplier,
        },
      };
    }

    case "history/undo": {
      const document = state.history.at(-1);
      if (!document) return state;
      const nextDocument = {
        ...cloneSystemDesignDocument(document),
        viewport: { ...state.document.viewport },
      };
      return {
        ...state,
        document: nextDocument,
        selectedNodeIds: [],
        selectedEdgeIds: [],
        history: state.history.slice(0, -1),
        future: [state.document, ...state.future].slice(
          0,
          SYSTEM_DESIGN_HISTORY_LIMIT,
        ),
        ...saveStatusForDocument(state, nextDocument),
        saveError: null,
      };
    }

    case "history/redo": {
      const document = state.future[0];
      if (!document) return state;
      const nextDocument = {
        ...cloneSystemDesignDocument(document),
        viewport: { ...state.document.viewport },
      };
      return {
        ...state,
        document: nextDocument,
        selectedNodeIds: [],
        selectedEdgeIds: [],
        history: pushHistory(state.history, state.document),
        future: state.future.slice(1),
        ...saveStatusForDocument(state, nextDocument),
        saveError: null,
      };
    }

    case "viewport/set": {
      const viewport = clampViewport(action.viewport);
      if (
        viewport.x === state.document.viewport.x &&
        viewport.y === state.document.viewport.y &&
        viewport.zoom === state.document.viewport.zoom
      ) {
        return state;
      }
      return updateDocumentWithoutHistory(
        state,
        { ...state.document, viewport },
        action.at,
      );
    }

    case "document/reset":
      return commitDocument(
        state,
        {
          ...state.document,
          status: "in_progress",
          nodes: [],
          edges: [],
          viewport: { ...DEFAULT_SYSTEM_DESIGN_VIEWPORT },
        },
        action.at,
        { selectedNodeIds: [], selectedEdgeIds: [] },
      );

    case "document/replace": {
      if (action.document.problemId !== state.problemId) return state;
      const document = cloneSystemDesignDocument(action.document);
      document.nodes = normalizeSystemDesignLayers(document.nodes);
      return commitDocument(state, document, action.at, {
        selectedNodeIds: [],
        selectedEdgeIds: [],
      });
    }

    case "document/complete":
      if (
        state.document.nodes.length === 0 ||
        state.document.status === "completed"
      ) {
        return state;
      }
      return commitDocument(
        state,
        { ...state.document, status: "completed" },
        action.at,
      );

    case "layer/reorder": {
      const nodes = reorderNode(
        state.document.nodes,
        action.nodeId,
        action.direction,
      );
      return nodes
        ? commitDocument(
            state,
            { ...state.document, nodes },
            action.at,
          )
        : state;
    }

    case "preview/set":
      return {
        ...state,
        isPreviewMode: action.enabled,
        selectedNodeIds: action.enabled ? [] : state.selectedNodeIds,
        selectedEdgeIds: action.enabled ? [] : state.selectedEdgeIds,
      };

    case "save/start":
      return {
        ...state,
        saveStatus: "saving",
        saveError: null,
        savingDocumentUpdatedAt: action.documentUpdatedAt,
      };

    case "save/success": {
      if (state.savingDocumentUpdatedAt !== action.documentUpdatedAt) {
        return state;
      }
      const currentWasSaved =
        state.document.updatedAt === action.documentUpdatedAt;
      return {
        ...state,
        isDirty: !currentWasSaved,
        saveStatus: currentWasSaved ? "saved" : "unsaved",
        saveError: null,
        lastSavedAt: action.savedAt,
        lastSavedDocumentUpdatedAt: action.documentUpdatedAt,
        savingDocumentUpdatedAt: null,
      };
    }

    case "save/failure":
      if (state.savingDocumentUpdatedAt !== action.documentUpdatedAt) {
        return state;
      }
      return {
        ...state,
        isDirty: true,
        saveStatus: "error",
        saveError: action.message,
        savingDocumentUpdatedAt: null,
      };

    default:
      return state;
  }
}
