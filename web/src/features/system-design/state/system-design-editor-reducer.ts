import { isSystemDesignModuleNodeType } from "../constants/system-design-palette";
import type {
  SystemDesignClipboard,
  SystemDesignDiagram,
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
  createEmptySystemDesignDiagram,
  createNextSystemDesignTimestamp,
  createSystemDesignId,
  normalizeSystemDesignLayers,
} from "../utils/system-design-defaults";
import {
  cloneSystemDesignClipboardFragment,
  createSystemDesignClipboardFragment,
} from "../utils/system-design-clipboard";
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
    activeDiagramId: document.rootDiagramId,
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

function activeDiagram(
  state: Pick<SystemDesignEditorState, "activeDiagramId" | "document">,
): SystemDesignDiagram {
  return (
    state.document.diagrams[state.activeDiagramId] ??
    state.document.diagrams[state.document.rootDiagramId]
  );
}

function resolveActiveDiagramId(
  document: SystemDesignDocument,
  preferred: string,
): string {
  return document.diagrams[preferred]
    ? preferred
    : document.rootDiagramId;
}

function replaceDiagram(
  document: SystemDesignDocument,
  diagram: SystemDesignDiagram,
): SystemDesignDocument {
  return {
    ...document,
    diagrams: {
      ...document.diagrams,
      [diagram.id]: diagram,
    },
  };
}

function hasAnyNodes(document: SystemDesignDocument): boolean {
  return Object.values(document.diagrams).some(
    (diagram) => diagram.nodes.length > 0,
  );
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
  requestedActiveDiagramId = state.activeDiagramId,
): SystemDesignEditorState {
  const nextDocument: SystemDesignDocument = {
    ...document,
    status: hasAnyNodes(document) ? document.status : "in_progress",
    updatedAt: createNextSystemDesignTimestamp(
      state.document.updatedAt,
      at,
    ),
  };
  const activeDiagramId = resolveActiveDiagramId(
    nextDocument,
    requestedActiveDiagramId,
  );
  const nextActiveDiagram = nextDocument.diagrams[activeDiagramId];
  const existingNodeIds = new Set(
    nextActiveDiagram?.nodes.map((node) => node.id) ?? [],
  );
  const existingEdgeIds = new Set(
    nextActiveDiagram?.edges.map((edge) => edge.id) ?? [],
  );
  return {
    ...state,
    document: nextDocument,
    activeDiagramId,
    selectedNodeIds: (
      selection?.selectedNodeIds ?? state.selectedNodeIds
    ).filter((id) => existingNodeIds.has(id)),
    selectedEdgeIds: (
      selection?.selectedEdgeIds ?? state.selectedEdgeIds
    ).filter((id) => existingEdgeIds.has(id)),
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

function expandGroupedNodeIds(
  diagram: SystemDesignDiagram,
  requestedNodeIds: readonly string[],
): string[] {
  const requested = new Set(requestedNodeIds);
  const groupIds = new Set(
    diagram.nodes.flatMap((node) =>
      requested.has(node.id) && node.groupId ? [node.groupId] : [],
    ),
  );
  return diagram.nodes
    .filter(
      (node) =>
        requested.has(node.id) ||
        (node.groupId !== undefined && groupIds.has(node.groupId)),
    )
    .map((node) => node.id);
}

function normalizeNodeGroups(
  nodes: readonly SystemDesignNode[],
): SystemDesignNode[] {
  const counts = new Map<string, number>();
  nodes.forEach((node) => {
    if (node.groupId) {
      counts.set(node.groupId, (counts.get(node.groupId) ?? 0) + 1);
    }
  });
  return nodes.map((node) =>
    node.groupId && (counts.get(node.groupId) ?? 0) < 2
      ? { ...node, groupId: undefined }
      : node,
  );
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

function collectDescendantDiagramIds(
  document: SystemDesignDocument,
  childDiagramIds: readonly string[],
  protectedDiagramIds: ReadonlySet<string>,
): Set<string> {
  const descendants = new Set<string>();
  const visit = (diagramId: string) => {
    if (
      descendants.has(diagramId) ||
      protectedDiagramIds.has(diagramId) ||
      !document.diagrams[diagramId]
    ) {
      return;
    }
    descendants.add(diagramId);
    document.diagrams[diagramId].nodes.forEach((node) => {
      if (node.childDiagramId) visit(node.childDiagramId);
    });
  };
  childDiagramIds.forEach(visit);
  return descendants;
}

function removeNodes(
  document: SystemDesignDocument,
  diagramId: string,
  nodeIds: readonly string[],
): SystemDesignDocument | null {
  const diagram = document.diagrams[diagramId];
  if (!diagram) return null;
  const requested = new Set(nodeIds);
  const removableNodes = diagram.nodes.filter(
    (node) => requested.has(node.id) && !node.locked,
  );
  if (removableNodes.length === 0) return null;
  const removableIds = new Set(removableNodes.map((node) => node.id));
  const descendantDiagramIds = collectDescendantDiagramIds(
    document,
    removableNodes.flatMap((node) =>
      node.childDiagramId ? [node.childDiagramId] : [],
    ),
    new Set([document.rootDiagramId, diagramId]),
  );
  const diagrams = Object.fromEntries(
    Object.entries(document.diagrams).filter(
      ([candidateId]) => !descendantDiagramIds.has(candidateId),
    ),
  );
  diagrams[diagramId] = {
    ...diagram,
    nodes: normalizeSystemDesignLayers(
      normalizeNodeGroups(
        diagram.nodes.filter((node) => !removableIds.has(node.id)),
      ),
    ),
    edges: diagram.edges.filter(
      (edge) =>
        !removableIds.has(edge.sourceNodeId) &&
        !removableIds.has(edge.targetNodeId),
    ),
  };
  return { ...document, diagrams };
}

function removeEdges(
  document: SystemDesignDocument,
  diagramId: string,
  edgeIds: readonly string[],
): SystemDesignDocument | null {
  const diagram = document.diagrams[diagramId];
  if (!diagram) return null;
  const requested = new Set(edgeIds);
  const edges = diagram.edges.filter((edge) => !requested.has(edge.id));
  return edges.length === diagram.edges.length
    ? null
    : replaceDiagram(document, { ...diagram, edges });
}

function allNodeIds(document: SystemDesignDocument): Set<string> {
  return new Set(
    Object.values(document.diagrams).flatMap((diagram) =>
      diagram.nodes.map((node) => node.id),
    ),
  );
}

function allEdgeIds(document: SystemDesignDocument): Set<string> {
  return new Set(
    Object.values(document.diagrams).flatMap((diagram) =>
      diagram.edges.map((edge) => edge.id),
    ),
  );
}

function allGroupIds(document: SystemDesignDocument): Set<string> {
  return new Set(
    Object.values(document.diagrams).flatMap((diagram) =>
      diagram.nodes.flatMap((node) => (node.groupId ? [node.groupId] : [])),
    ),
  );
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

function createClonedGroupIds(
  nodes: readonly SystemDesignNode[],
  usedGroupIds: Set<string>,
): Map<string, string> {
  const counts = new Map<string, number>();
  nodes.forEach((node) => {
    if (node.groupId) {
      counts.set(node.groupId, (counts.get(node.groupId) ?? 0) + 1);
    }
  });
  return new Map(
    [...counts.entries()].flatMap(([sourceGroupId, count]) =>
      count >= 2
        ? [
            [
              sourceGroupId,
              nextAvailableId(undefined, "group", usedGroupIds),
            ] as const,
          ]
        : [],
    ),
  );
}

function cloneNode(node: SystemDesignNode): SystemDesignNode {
  return {
    ...node,
    technology: node.technology ? { ...node.technology } : undefined,
    asset: node.asset ? { ...node.asset } : undefined,
    drawing: node.drawing
      ? {
          ...node.drawing,
          points: [...node.drawing.points],
          dashPattern: node.drawing.dashPattern
            ? [...node.drawing.dashPattern]
            : undefined,
        }
      : undefined,
    style: node.style ? { ...node.style } : undefined,
    textStyle: node.textStyle ? { ...node.textStyle } : undefined,
    metadata: node.metadata ? { ...node.metadata } : undefined,
  };
}

interface DuplicateResult {
  document: SystemDesignDocument;
  nodeIds: string[];
  edgeIds: string[];
}

function duplicateElementsWithHierarchy(
  document: SystemDesignDocument,
  diagramId: string,
  sourceNodes: readonly SystemDesignNode[],
  sourceEdges: readonly SystemDesignEdge[],
  offset: SystemDesignPoint,
  nodeIdMap: Readonly<Record<string, string>> | undefined,
  edgeIdMap: Readonly<Record<string, string>> | undefined,
  sourceDiagrams: Readonly<Record<string, SystemDesignDiagram>> =
    document.diagrams,
): DuplicateResult | null {
  const diagram = document.diagrams[diagramId];
  if (!diagram || sourceNodes.length === 0) return null;

  const usedNodeIds = allNodeIds(document);
  const usedEdgeIds = allEdgeIds(document);
  const usedGroupIds = allGroupIds(document);
  const usedDiagramIds = new Set(Object.keys(document.diagrams));
  const diagramsToAdd: Record<string, SystemDesignDiagram> = {};

  const cloneDiagramTree = (
    sourceDiagramId: string,
    parentNodeId: string,
    ancestors: ReadonlySet<string>,
  ): string | undefined => {
    const sourceDiagram = sourceDiagrams[sourceDiagramId];
    if (!sourceDiagram || ancestors.has(sourceDiagramId)) return undefined;
    const nextAncestors = new Set(ancestors).add(sourceDiagramId);
    const clonedDiagramId = nextAvailableId(
      undefined,
      "diagram",
      usedDiagramIds,
    );
    const nodeIds = new Map<string, string>();
    sourceDiagram.nodes.forEach((node) => {
      nodeIds.set(
        node.id,
        nextAvailableId(undefined, "node", usedNodeIds),
      );
    });
    const clonedGroupIds = createClonedGroupIds(
      sourceDiagram.nodes,
      usedGroupIds,
    );
    const clonedNodes = sourceDiagram.nodes.map((sourceNode) => {
      const clonedNodeId = nodeIds.get(sourceNode.id)!;
      const clonedChildDiagramId = sourceNode.childDiagramId
        ? cloneDiagramTree(
            sourceNode.childDiagramId,
            clonedNodeId,
            nextAncestors,
          )
        : undefined;
      return {
        ...cloneNode(sourceNode),
        id: clonedNodeId,
        groupId: sourceNode.groupId
          ? clonedGroupIds.get(sourceNode.groupId)
          : undefined,
        childDiagramId: clonedChildDiagramId,
        isExpandable:
          isSystemDesignModuleNodeType(sourceNode.type)
            ? clonedChildDiagramId
              ? true
              : sourceNode.isExpandable
            : sourceNode.isExpandable,
        parentModuleId: sourceNode.parentModuleId
          ? sourceNode.parentModuleId === sourceDiagram.parentNodeId
            ? parentNodeId
            : nodeIds.get(sourceNode.parentModuleId)
          : undefined,
      };
    });
    const clonedEdges = sourceDiagram.edges.flatMap((sourceEdge) => {
      const sourceNodeId = nodeIds.get(sourceEdge.sourceNodeId);
      const targetNodeId = nodeIds.get(sourceEdge.targetNodeId);
      if (!sourceNodeId || !targetNodeId) return [];
      return [
        {
          ...sourceEdge,
          dashPattern: sourceEdge.dashPattern
            ? [...sourceEdge.dashPattern]
            : undefined,
          id: nextAvailableId(undefined, "edge", usedEdgeIds),
          sourceNodeId,
          targetNodeId,
        },
      ];
    });
    diagramsToAdd[clonedDiagramId] = {
      ...sourceDiagram,
      id: clonedDiagramId,
      parentNodeId,
      nodes: clonedNodes,
      edges: clonedEdges,
      viewport: { ...sourceDiagram.viewport },
    };
    return clonedDiagramId;
  };

  const selectedNodeIds = new Map<string, string>();
  sourceNodes.forEach((node) => {
    selectedNodeIds.set(
      node.id,
      nextAvailableId(nodeIdMap?.[node.id], "node", usedNodeIds),
    );
  });
  const startLayer =
    diagram.nodes.reduce((maximum, node) => Math.max(maximum, node.layer), -1) +
    1;
  const clonedGroupIds = createClonedGroupIds(sourceNodes, usedGroupIds);
  const nodes = sourceNodes
    .slice()
    .sort((left, right) => left.layer - right.layer)
    .map((source, index) => {
      const id = selectedNodeIds.get(source.id)!;
      const childDiagramId = source.childDiagramId
        ? cloneDiagramTree(source.childDiagramId, id, new Set([diagramId]))
        : undefined;
      return {
        ...cloneNode(source),
        id,
        groupId: source.groupId
          ? clonedGroupIds.get(source.groupId)
          : undefined,
        x: source.x + offset.x,
        y: source.y + offset.y,
        childDiagramId,
        isExpandable:
          isSystemDesignModuleNodeType(source.type)
            ? childDiagramId
              ? true
              : source.isExpandable
            : source.isExpandable,
        parentModuleId: source.parentModuleId
          ? (selectedNodeIds.get(source.parentModuleId) ??
            diagram.parentNodeId)
          : diagram.parentNodeId,
        layer: startLayer + index,
      };
    });
  const edges = sourceEdges.flatMap((source) => {
    const sourceNodeId = selectedNodeIds.get(source.sourceNodeId);
    const targetNodeId = selectedNodeIds.get(source.targetNodeId);
    if (!sourceNodeId || !targetNodeId) return [];
    return [
      {
        ...source,
        dashPattern: source.dashPattern ? [...source.dashPattern] : undefined,
        id: nextAvailableId(
          edgeIdMap?.[source.id],
          "edge",
          usedEdgeIds,
        ),
        sourceNodeId,
        targetNodeId,
      },
    ];
  });
  const nextDiagram = {
    ...diagram,
    nodes: [...diagram.nodes, ...nodes],
    edges: [...diagram.edges, ...edges],
  };
  return {
    document: {
      ...document,
      diagrams: {
        ...document.diagrams,
        ...diagramsToAdd,
        [diagramId]: nextDiagram,
      },
    },
    nodeIds: nodes.map((node) => node.id),
    edgeIds: edges.map((edge) => edge.id),
  };
}

function copySelectedNodes(
  state: SystemDesignEditorState,
): SystemDesignClipboard | null {
  const fragment = createSystemDesignClipboardFragment(
    state.document,
    state.activeDiagramId,
    state.selectedNodeIds,
  );
  return fragment ? { ...fragment, pasteCount: 0 } : null;
}

function reorderNodes(
  nodes: readonly SystemDesignNode[],
  nodeIds: readonly string[],
  direction: SystemDesignLayerDirection,
): SystemDesignNode[] | null {
  const ordered = normalizeSystemDesignLayers(nodes);
  const selected = new Set(nodeIds);
  if (!ordered.some((node) => selected.has(node.id))) return null;
  let next: SystemDesignNode[];
  if (direction === "forward") {
    next = [...ordered];
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (
        selected.has(next[index].id) &&
        !selected.has(next[index + 1].id)
      ) {
        [next[index], next[index + 1]] = [next[index + 1], next[index]];
      }
    }
  } else if (direction === "backward") {
    next = [...ordered];
    for (let index = 1; index < next.length; index += 1) {
      if (
        selected.has(next[index].id) &&
        !selected.has(next[index - 1].id)
      ) {
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
      }
    }
  } else if (direction === "front") {
    next = [
      ...ordered.filter((node) => !selected.has(node.id)),
      ...ordered.filter((node) => selected.has(node.id)),
    ];
  } else {
    next = [
      ...ordered.filter((node) => selected.has(node.id)),
      ...ordered.filter((node) => !selected.has(node.id)),
    ];
  }
  if (next.every((node, index) => node.id === ordered[index]?.id)) {
    return null;
  }
  return next.map((item, layer) => ({ ...item, layer }));
}

function isBlockedInPreview(action: SystemDesignEditorAction): boolean {
  return (
    action.type === "node/add" ||
    action.type === "node/update" ||
    action.type === "nodes/update" ||
    action.type === "nodes/move" ||
    action.type === "nodes/arrange" ||
    action.type === "nodes/set-state" ||
    action.type === "nodes/group" ||
    action.type === "nodes/ungroup" ||
    action.type === "node/resize" ||
    action.type === "nodes/delete" ||
    action.type === "edges/delete" ||
    action.type === "selection/delete" ||
    action.type === "nodes/duplicate" ||
    action.type === "clipboard/cut" ||
    action.type === "edge/add" ||
    action.type === "edge/update" ||
    action.type === "clipboard/paste" ||
    action.type === "clipboard/paste-fragment" ||
    action.type === "history/undo" ||
    action.type === "history/redo" ||
    action.type === "document/reset" ||
    action.type === "document/replace" ||
    action.type === "document/complete" ||
    action.type === "layer/reorder" ||
    action.type === "layers/reorder-selection"
  );
}

function sanitizeNodePatch(
  changes: SystemDesignNodePatch,
): SystemDesignNodePatch {
  const sanitized: SystemDesignNodePatch = { ...changes };
  if (changes.metadata === undefined) delete sanitized.metadata;
  else if (changes.metadata) sanitized.metadata = { ...changes.metadata };
  if (changes.technology) {
    sanitized.technology = { ...changes.technology };
  }
  if (changes.asset) sanitized.asset = { ...changes.asset };
  if (changes.drawing) {
    sanitized.drawing = {
      ...changes.drawing,
      points: [...changes.drawing.points],
      dashPattern: changes.drawing.dashPattern
        ? [...changes.drawing.dashPattern]
        : undefined,
    };
  }
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

function normalizeDocumentDiagrams(
  document: SystemDesignDocument,
): SystemDesignDocument {
  return {
    ...document,
    diagrams: Object.fromEntries(
      Object.entries(document.diagrams).map(([diagramId, diagram]) => [
        diagramId,
        {
          ...diagram,
          nodes: normalizeSystemDesignLayers(diagram.nodes),
          viewport: { ...diagram.viewport },
        },
      ]),
    ),
  };
}

function preserveLiveViewports(
  restored: SystemDesignDocument,
  live: SystemDesignDocument,
): SystemDesignDocument {
  return {
    ...restored,
    diagrams: Object.fromEntries(
      Object.entries(restored.diagrams).map(([diagramId, diagram]) => [
        diagramId,
        {
          ...diagram,
          viewport: {
            ...(live.diagrams[diagramId]?.viewport ?? diagram.viewport),
          },
        },
      ]),
    ),
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

    case "diagram/activate":
      if (
        action.diagramId === state.activeDiagramId ||
        !state.document.diagrams[action.diagramId]
      ) {
        return state;
      }
      return {
        ...state,
        activeDiagramId: action.diagramId,
        selectedNodeIds: [],
        selectedEdgeIds: [],
      };

    case "module/open-or-create": {
      const diagram = activeDiagram(state);
      const moduleNode = diagram.nodes.find(
        (node) => node.id === action.nodeId,
      );
      if (
        !moduleNode ||
        (!isSystemDesignModuleNodeType(moduleNode.type) &&
          !moduleNode.isExpandable)
      ) {
        return state;
      }
      if (
        moduleNode.childDiagramId &&
        state.document.diagrams[moduleNode.childDiagramId]
      ) {
        return {
          ...state,
          activeDiagramId: moduleNode.childDiagramId,
          selectedNodeIds: [],
          selectedEdgeIds: [],
        };
      }
      if (state.isPreviewMode) return state;
      const usedDiagramIds = new Set(Object.keys(state.document.diagrams));
      const childDiagramId = nextAvailableId(
        action.childDiagramId ?? moduleNode.childDiagramId,
        "diagram",
        usedDiagramIds,
      );
      const childDiagram = createEmptySystemDesignDiagram(
        moduleNode.label,
        {
          id: childDiagramId,
          parentNodeId: moduleNode.id,
        },
      );
      const nextDiagram = {
        ...diagram,
        nodes: diagram.nodes.map((node) =>
          node.id === moduleNode.id
            ? {
                ...node,
                childDiagramId,
                isExpandable: true,
                isCollapsed: false,
              }
            : node,
        ),
      };
      return commitDocument(
        state,
        {
          ...state.document,
          diagrams: {
            ...state.document.diagrams,
            [nextDiagram.id]: nextDiagram,
            [childDiagram.id]: childDiagram,
          },
        },
        action.at,
        { selectedNodeIds: [], selectedEdgeIds: [] },
        childDiagramId,
      );
    }

    case "node/add": {
      const diagramId = action.diagramId ?? state.activeDiagramId;
      const diagram = state.document.diagrams[diagramId];
      if (!diagram) return state;
      if (allNodeIds(state.document).has(action.node.id)) return state;
      const layer =
        diagram.nodes.reduce(
          (maximum, node) => Math.max(maximum, node.layer),
          -1,
        ) + 1;
      const node: SystemDesignNode = {
        ...cloneNode(action.node),
        x: Number.isFinite(action.node.x) ? action.node.x : 0,
        y: Number.isFinite(action.node.y) ? action.node.y : 0,
        width: Number.isFinite(action.node.width)
          ? Math.max(
              action.node.type === "freehand" ? 1 : MIN_NODE_WIDTH,
              action.node.width,
            )
          : MIN_NODE_WIDTH,
        height: Number.isFinite(action.node.height)
          ? Math.max(
              action.node.type === "freehand" ? 1 : MIN_NODE_HEIGHT,
              action.node.height,
            )
          : MIN_NODE_HEIGHT,
        isExpandable:
          isSystemDesignModuleNodeType(action.node.type)
            ? (action.node.isExpandable ?? true)
            : action.node.isExpandable,
        parentModuleId: action.node.parentModuleId,
        layer,
      };
      return commitDocument(
        state,
        replaceDiagram(state.document, {
          ...diagram,
          nodes: [...diagram.nodes, node],
        }),
        action.at,
        action.select === false || diagramId !== state.activeDiagramId
          ? undefined
          : { selectedNodeIds: [node.id], selectedEdgeIds: [] },
      );
    }

    case "node/update": {
      const diagram =
        state.document.diagrams[action.diagramId ?? state.activeDiagramId];
      if (!diagram) return state;
      let changed = false;
      let linkedDiagramRename:
        | { diagramId: string; name: string }
        | undefined;
      const nodes = diagram.nodes.map((node) => {
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
        const updatedNode = { ...node, ...patch, id: node.id };
        if (
          isSystemDesignModuleNodeType(node.type) &&
          typeof patch.label === "string" &&
          patch.label !== node.label &&
          updatedNode.childDiagramId &&
          state.document.diagrams[updatedNode.childDiagramId]
        ) {
          linkedDiagramRename = {
            diagramId: updatedNode.childDiagramId,
            name: patch.label,
          };
        }
        return updatedNode;
      });
      if (!changed) return state;
      let document = replaceDiagram(state.document, {
        ...diagram,
        nodes,
      });
      if (linkedDiagramRename) {
        const childDiagram =
          document.diagrams[linkedDiagramRename.diagramId];
        document = replaceDiagram(document, {
          ...childDiagram,
          name: linkedDiagramRename.name,
        });
      }
      return commitDocument(
        state,
        document,
        action.at,
      );
    }

    case "nodes/update": {
      const diagram =
        state.document.diagrams[action.diagramId ?? state.activeDiagramId];
      if (!diagram) return state;
      let changed = false;
      const nodes = diagram.nodes.map((node) => {
        const requested = action.patches[node.id];
        if (!requested) return node;
        const patch = sanitizeNodePatch(requested);
        if (node.locked) {
          delete patch.x;
          delete patch.y;
          delete patch.width;
          delete patch.height;
        }
        if (Object.keys(patch).length === 0) return node;
        const candidate = { ...node, ...patch, id: node.id };
        if (JSON.stringify(candidate) === JSON.stringify(node)) return node;
        changed = true;
        return candidate;
      });
      if (!changed) return state;
      return commitDocument(
        state,
        replaceDiagram(state.document, { ...diagram, nodes }),
        action.at,
      );
    }

    case "nodes/move": {
      const diagram =
        state.document.diagrams[action.diagramId ?? state.activeDiagramId];
      if (!diagram) return state;
      let changed = false;
      const nodes = diagram.nodes.map((node) => {
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
        replaceDiagram(state.document, { ...diagram, nodes }),
        action.at,
      );
    }

    case "nodes/arrange": {
      const diagram = activeDiagram(state);
      let changed = false;
      const nodes = diagram.nodes.map((node) => {
        const frame = action.frames[node.id];
        if (
          !frame ||
          node.locked ||
          !Number.isFinite(frame.x) ||
          !Number.isFinite(frame.y) ||
          !Number.isFinite(frame.width) ||
          !Number.isFinite(frame.height)
        ) {
          return node;
        }
        const next = {
          x: frame.x,
          y: frame.y,
          width: Math.max(MIN_NODE_WIDTH, frame.width),
          height: Math.max(MIN_NODE_HEIGHT, frame.height),
        };
        if (
          next.x === node.x &&
          next.y === node.y &&
          next.width === node.width &&
          next.height === node.height
        ) {
          return node;
        }
        changed = true;
        return { ...node, ...next };
      });
      return changed
        ? commitDocument(
            state,
            replaceDiagram(state.document, { ...diagram, nodes }),
            action.at,
          )
        : state;
    }

    case "nodes/set-state": {
      if (action.locked === undefined && action.visible === undefined) {
        return state;
      }
      const diagram = activeDiagram(state);
      const nodeIds = new Set(
        expandGroupedNodeIds(
          diagram,
          action.nodeIds ?? state.selectedNodeIds,
        ),
      );
      let changed = false;
      const nodes = diagram.nodes.map((node) => {
        if (!nodeIds.has(node.id)) return node;
        const locked = action.locked ?? node.locked;
        const visible = action.visible ?? node.visible;
        if (locked === node.locked && visible === node.visible) return node;
        changed = true;
        return { ...node, locked, visible };
      });
      if (!changed) return state;
      return commitDocument(
        state,
        replaceDiagram(state.document, { ...diagram, nodes }),
        action.at,
        action.visible === false
          ? {
              selectedNodeIds: state.selectedNodeIds.filter(
                (nodeId) => !nodeIds.has(nodeId),
              ),
            }
          : undefined,
      );
    }

    case "nodes/group": {
      const diagram = activeDiagram(state);
      const nodeIds = expandGroupedNodeIds(
        diagram,
        action.nodeIds ?? state.selectedNodeIds,
      );
      if (nodeIds.length < 2) return state;
      const selected = new Set(nodeIds);
      const groupId = nextAvailableId(
        action.groupId,
        "group",
        allGroupIds(state.document),
      );
      const nodes = diagram.nodes.map((node) =>
        selected.has(node.id) ? { ...node, groupId } : node,
      );
      return commitDocument(
        state,
        replaceDiagram(state.document, { ...diagram, nodes }),
        action.at,
        { selectedNodeIds: nodeIds, selectedEdgeIds: [] },
      );
    }

    case "nodes/ungroup": {
      const diagram = activeDiagram(state);
      const selectedNodeIds = expandGroupedNodeIds(
        diagram,
        action.nodeIds ?? state.selectedNodeIds,
      );
      const selected = new Set(selectedNodeIds);
      const groupIds = new Set(
        diagram.nodes.flatMap((node) =>
          selected.has(node.id) && node.groupId ? [node.groupId] : [],
        ),
      );
      if (groupIds.size === 0) return state;
      const nodes = diagram.nodes.map((node) =>
        node.groupId && groupIds.has(node.groupId)
          ? { ...node, groupId: undefined }
          : node,
      );
      return commitDocument(
        state,
        replaceDiagram(state.document, { ...diagram, nodes }),
        action.at,
        { selectedNodeIds, selectedEdgeIds: [] },
      );
    }

    case "node/resize": {
      const diagram =
        state.document.diagrams[action.diagramId ?? state.activeDiagramId];
      if (!diagram) return state;
      const node = diagram.nodes.find(
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
      if (
        width === node.width &&
        height === node.height &&
        x === node.x &&
        y === node.y
      ) {
        return state;
      }
      return commitDocument(
        state,
        replaceDiagram(state.document, {
          ...diagram,
          nodes: diagram.nodes.map((candidate) =>
            candidate.id === node.id
              ? { ...candidate, width, height, x, y }
              : candidate,
          ),
        }),
        action.at,
      );
    }

    case "nodes/delete": {
      const document = removeNodes(
        state.document,
        action.diagramId ?? state.activeDiagramId,
        action.nodeIds,
      );
      return document
        ? commitDocument(state, document, action.at)
        : state;
    }

    case "edges/delete": {
      const document = removeEdges(
        state.document,
        action.diagramId ?? state.activeDiagramId,
        action.edgeIds,
      );
      return document
        ? commitDocument(state, document, action.at)
        : state;
    }

    case "selection/delete": {
      const withoutNodes = removeNodes(
        state.document,
        state.activeDiagramId,
        state.selectedNodeIds,
      );
      const base = withoutNodes ?? state.document;
      const withoutEdges = removeEdges(
        base,
        state.activeDiagramId,
        state.selectedEdgeIds,
      );
      const document = withoutEdges ?? withoutNodes;
      return document
        ? commitDocument(state, document, action.at)
        : state;
    }

    case "nodes/duplicate": {
      const diagram = activeDiagram(state);
      const requested = new Set(
        action.nodeIds ?? state.selectedNodeIds,
      );
      const sourceNodes = diagram.nodes.filter((node) =>
        requested.has(node.id),
      );
      const sourceEdges = diagram.edges.filter(
        (edge) =>
          requested.has(edge.sourceNodeId) &&
          requested.has(edge.targetNodeId),
      );
      const result = duplicateElementsWithHierarchy(
        state.document,
        state.activeDiagramId,
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
            selectedEdgeIds: result.edgeIds,
          })
        : state;
    }

    case "edge/add": {
      const diagram =
        state.document.diagrams[action.diagramId ?? state.activeDiagramId];
      if (!diagram) return state;
      if (
        allEdgeIds(state.document).has(action.edge.id) ||
        !isValidEdge(action.edge, diagram.nodes, diagram.edges)
      ) {
        return state;
      }
      return commitDocument(
        state,
        replaceDiagram(state.document, {
          ...diagram,
          edges: [...diagram.edges, { ...action.edge }],
        }),
        action.at,
        action.select === false || diagram.id !== state.activeDiagramId
          ? undefined
          : { selectedNodeIds: [], selectedEdgeIds: [action.edge.id] },
      );
    }

    case "edge/update": {
      const diagram =
        state.document.diagrams[action.diagramId ?? state.activeDiagramId];
      if (!diagram) return state;
      const edge = diagram.edges.find(
        (candidate) => candidate.id === action.edgeId,
      );
      if (!edge) return state;
      const updated = mergeEdge(edge, action.changes);
      if (!isValidEdge(updated, diagram.nodes, diagram.edges, edge.id)) {
        return state;
      }
      return commitDocument(
        state,
        replaceDiagram(state.document, {
          ...diagram,
          edges: diagram.edges.map((candidate) =>
            candidate.id === edge.id ? updated : candidate,
          ),
        }),
        action.at,
      );
    }

    case "selection/nodes": {
      const diagram = activeDiagram(state);
      const existing = new Set(diagram.nodes.map((node) => node.id));
      const requested = expandGroupedNodeIds(
        diagram,
        action.nodeIds.filter((id) => existing.has(id)),
      );
      const selectedNodeIds = applySelection(
        state.selectedNodeIds,
        requested,
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
      const diagram = activeDiagram(state);
      const existing = new Set(diagram.edges.map((edge) => edge.id));
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

    case "selection/all": {
      const diagram = activeDiagram(state);
      const selectedNodeIds = diagram.nodes
        .filter((node) => node.visible !== false)
        .map((node) => node.id);
      const selected = new Set(selectedNodeIds);
      return {
        ...state,
        selectedNodeIds,
        selectedEdgeIds: diagram.edges
          .filter(
            (edge) =>
              selected.has(edge.sourceNodeId) &&
              selected.has(edge.targetNodeId),
          )
          .map((edge) => edge.id),
      };
    }

    case "clipboard/copy": {
      const clipboard = action.fragment
        ? {
            ...cloneSystemDesignClipboardFragment(action.fragment),
            pasteCount: 0,
          }
        : copySelectedNodes(state);
      return clipboard ? { ...state, clipboard } : state;
    }

    case "clipboard/cut": {
      const clipboard = action.fragment
        ? {
            ...cloneSystemDesignClipboardFragment(action.fragment),
            pasteCount: 0,
          }
        : copySelectedNodes(state);
      const withoutNodes = removeNodes(
        state.document,
        state.activeDiagramId,
        state.selectedNodeIds,
      );
      const base = withoutNodes ?? state.document;
      const withoutEdges = removeEdges(
        base,
        state.activeDiagramId,
        state.selectedEdgeIds,
      );
      const document = withoutEdges ?? withoutNodes;
      if (!document) return clipboard ? { ...state, clipboard } : state;
      return {
        ...commitDocument(
          state,
          document,
          action.at,
          { selectedNodeIds: [], selectedEdgeIds: [] },
        ),
        clipboard: clipboard ?? state.clipboard,
      };
    }

    case "clipboard/paste": {
      if (!state.clipboard) return state;
      const clipboard = state.clipboard;
      const multiplier = state.clipboard.pasteCount + 1;
      const offset = action.offset ?? {
        x: SYSTEM_DESIGN_PASTE_OFFSET * multiplier,
        y: SYSTEM_DESIGN_PASTE_OFFSET * multiplier,
      };
      const result = duplicateElementsWithHierarchy(
        state.document,
        state.activeDiagramId,
        state.clipboard.nodes,
        state.clipboard.edges,
        offset,
        action.nodeIdMap,
        action.edgeIdMap,
        clipboard.diagrams,
      );
      if (!result) return state;
      return {
        ...commitDocument(state, result.document, action.at, {
          selectedNodeIds: result.nodeIds,
          selectedEdgeIds: result.edgeIds,
        }),
        clipboard: {
          ...state.clipboard,
          pasteCount: multiplier,
        },
      };
    }

    case "clipboard/paste-fragment": {
      const sameFragment = state.clipboard?.id === action.fragment.id;
      const clipboard: SystemDesignClipboard = sameFragment
        ? state.clipboard!
        : {
            ...cloneSystemDesignClipboardFragment(action.fragment),
            pasteCount: 0,
          };
      const multiplier = clipboard.pasteCount + 1;
      const offset = action.offset ?? {
        x: SYSTEM_DESIGN_PASTE_OFFSET * multiplier,
        y: SYSTEM_DESIGN_PASTE_OFFSET * multiplier,
      };
      const result = duplicateElementsWithHierarchy(
        state.document,
        state.activeDiagramId,
        clipboard.nodes,
        clipboard.edges,
        offset,
        undefined,
        undefined,
        clipboard.diagrams,
      );
      if (!result) return state;
      return {
        ...commitDocument(state, result.document, action.at, {
          selectedNodeIds: result.nodeIds,
          selectedEdgeIds: result.edgeIds,
        }),
        clipboard: { ...clipboard, pasteCount: multiplier },
      };
    }

    case "history/undo": {
      const document = state.history.at(-1);
      if (!document) return state;
      const nextDocument = preserveLiveViewports(
        cloneSystemDesignDocument(document),
        state.document,
      );
      return {
        ...state,
        document: nextDocument,
        activeDiagramId: resolveActiveDiagramId(
          nextDocument,
          state.activeDiagramId,
        ),
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
      const nextDocument = preserveLiveViewports(
        cloneSystemDesignDocument(document),
        state.document,
      );
      return {
        ...state,
        document: nextDocument,
        activeDiagramId: resolveActiveDiagramId(
          nextDocument,
          state.activeDiagramId,
        ),
        selectedNodeIds: [],
        selectedEdgeIds: [],
        history: pushHistory(state.history, state.document),
        future: state.future.slice(1),
        ...saveStatusForDocument(state, nextDocument),
        saveError: null,
      };
    }

    case "viewport/set": {
      const diagram = action.diagramId
        ? state.document.diagrams[action.diagramId]
        : activeDiagram(state);
      if (!diagram) return state;
      const viewport = clampViewport(action.viewport);
      if (
        viewport.x === diagram.viewport.x &&
        viewport.y === diagram.viewport.y &&
        viewport.zoom === diagram.viewport.zoom
      ) {
        return state;
      }
      return updateDocumentWithoutHistory(
        state,
        replaceDiagram(state.document, { ...diagram, viewport }),
        action.at,
      );
    }

    case "document/reset": {
      const root = state.document.diagrams[state.document.rootDiagramId];
      const emptyRoot: SystemDesignDiagram = {
        id: state.document.rootDiagramId,
        name: root?.name ?? state.document.title,
        nodes: [],
        edges: [],
        viewport: { ...DEFAULT_SYSTEM_DESIGN_VIEWPORT },
      };
      return commitDocument(
        state,
        {
          ...state.document,
          status: "in_progress",
          diagrams: { [emptyRoot.id]: emptyRoot },
        },
        action.at,
        { selectedNodeIds: [], selectedEdgeIds: [] },
        emptyRoot.id,
      );
    }

    case "document/replace": {
      if (
        action.document.problemId !== state.problemId ||
        !action.document.diagrams[action.document.rootDiagramId]
      ) {
        return state;
      }
      const document = normalizeDocumentDiagrams(
        cloneSystemDesignDocument(action.document),
      );
      return commitDocument(
        state,
        document,
        action.at,
        { selectedNodeIds: [], selectedEdgeIds: [] },
        document.rootDiagramId,
      );
    }

    case "collaboration/replace-document": {
      if (!action.document.diagrams[action.document.rootDiagramId]) {
        return state;
      }
      const normalized = normalizeDocumentDiagrams(
        cloneSystemDesignDocument(action.document),
      );
      const document = preserveLiveViewports(normalized, state.document);
      const activeDiagramId = resolveActiveDiagramId(
        document,
        state.activeDiagramId,
      );
      const diagram = document.diagrams[activeDiagramId];
      const nodeIds = new Set(diagram.nodes.map((node) => node.id));
      const edgeIds = new Set(diagram.edges.map((edge) => edge.id));
      return {
        ...state,
        problemId: document.problemId,
        document,
        activeDiagramId,
        selectedNodeIds: state.selectedNodeIds.filter((id) => nodeIds.has(id)),
        selectedEdgeIds: state.selectedEdgeIds.filter((id) => edgeIds.has(id)),
        future: [],
        loadStatus: "ready",
        loadError: null,
        isDirty: true,
        saveStatus: "unsaved",
        saveError: null,
      };
    }

    case "collaboration/add-diagram": {
      const parentDiagram = state.document.diagrams[action.parentDiagramId];
      const parentNode = parentDiagram?.nodes.find(
        (node) => node.id === action.parentNodeId,
      );
      if (
        !parentDiagram ||
        !parentNode ||
        state.document.diagrams[action.diagram.id] ||
        action.diagram.parentNodeId !== parentNode.id
      ) {
        return state;
      }
      const nextParent = {
        ...parentDiagram,
        nodes: parentDiagram.nodes.map((node) =>
          node.id === parentNode.id
            ? {
                ...node,
                childDiagramId: action.diagram.id,
                isExpandable: true,
                isCollapsed: false,
              }
            : node,
        ),
      };
      return commitDocument(
        state,
        {
          ...state.document,
          diagrams: {
            ...state.document.diagrams,
            [nextParent.id]: nextParent,
            [action.diagram.id]: {
              ...action.diagram,
              nodes: action.diagram.nodes.map(cloneNode),
              edges: action.diagram.edges.map((edge) => ({
                ...edge,
                dashPattern: edge.dashPattern
                  ? [...edge.dashPattern]
                  : undefined,
              })),
              viewport: { ...action.diagram.viewport },
            },
          },
        },
        action.at,
      );
    }

    case "document/complete":
      if (!hasAnyNodes(state.document) || state.document.status === "completed") {
        return state;
      }
      return commitDocument(
        state,
        { ...state.document, status: "completed" },
        action.at,
      );

    case "layer/reorder": {
      const diagram = activeDiagram(state);
      const nodes = reorderNodes(
        diagram.nodes,
        expandGroupedNodeIds(diagram, [action.nodeId]),
        action.direction,
      );
      return nodes
        ? commitDocument(
            state,
            replaceDiagram(state.document, { ...diagram, nodes }),
            action.at,
          )
        : state;
    }

    case "layers/reorder-selection": {
      const diagram = activeDiagram(state);
      const nodes = reorderNodes(
        diagram.nodes,
        expandGroupedNodeIds(
          diagram,
          action.nodeIds ?? state.selectedNodeIds,
        ),
        action.direction,
      );
      return nodes
        ? commitDocument(
            state,
            replaceDiagram(state.document, { ...diagram, nodes }),
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
