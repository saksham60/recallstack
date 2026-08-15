import type {
  SystemDesignClipboardFragment,
  SystemDesignDocument,
  SystemDesignEdge,
  SystemDesignEditorState,
  SystemDesignLayerDirection,
  SystemDesignNode,
  SystemDesignPoint,
  SystemDesignRect,
  SystemDesignSelectionMode,
  SystemDesignSize,
  SystemDesignViewport,
} from "../types/system-design.types";

export type SystemDesignNodePatch = Partial<
  Omit<SystemDesignNode, "id" | "type">
>;

export type SystemDesignEdgePatch = Partial<Omit<SystemDesignEdge, "id">>;

export type SystemDesignEditorAction =
  | { type: "load/start" }
  | {
      type: "load/success";
      document: SystemDesignDocument;
      persisted: boolean;
    }
  | { type: "load/failure"; message: string }
  | { type: "diagram/activate"; diagramId: string }
  | {
      type: "module/open-or-create";
      nodeId: string;
      childDiagramId?: string;
      at: string;
    }
  | { type: "node/add"; node: SystemDesignNode; at: string }
  | {
      type: "node/update";
      nodeId: string;
      changes: SystemDesignNodePatch;
      at: string;
    }
  | {
      type: "nodes/move";
      positions: Readonly<Record<string, SystemDesignPoint>>;
      at: string;
    }
  | {
      type: "nodes/arrange";
      frames: Readonly<Record<string, SystemDesignRect>>;
      at: string;
    }
  | {
      type: "nodes/set-state";
      nodeIds?: string[];
      locked?: boolean;
      visible?: boolean;
      at: string;
    }
  | {
      type: "nodes/group";
      nodeIds?: string[];
      groupId?: string;
      at: string;
    }
  | { type: "nodes/ungroup"; nodeIds?: string[]; at: string }
  | {
      type: "node/resize";
      nodeId: string;
      size: SystemDesignSize;
      position?: SystemDesignPoint;
      at: string;
    }
  | { type: "nodes/delete"; nodeIds: string[]; at: string }
  | { type: "edges/delete"; edgeIds: string[]; at: string }
  | { type: "selection/delete"; at: string }
  | {
      type: "nodes/duplicate";
      nodeIds?: string[];
      offset?: SystemDesignPoint;
      nodeIdMap?: Readonly<Record<string, string>>;
      edgeIdMap?: Readonly<Record<string, string>>;
      at: string;
    }
  | { type: "edge/add"; edge: SystemDesignEdge; at: string }
  | {
      type: "edge/update";
      edgeId: string;
      changes: SystemDesignEdgePatch;
      at: string;
    }
  | {
      type: "selection/nodes";
      nodeIds: string[];
      mode: SystemDesignSelectionMode;
    }
  | {
      type: "selection/edges";
      edgeIds: string[];
      mode: SystemDesignSelectionMode;
    }
  | { type: "selection/clear" }
  | { type: "selection/all" }
  | {
      type: "clipboard/copy";
      fragment?: SystemDesignClipboardFragment;
    }
  | {
      type: "clipboard/cut";
      fragment?: SystemDesignClipboardFragment;
      at: string;
    }
  | {
      type: "clipboard/paste";
      offset?: SystemDesignPoint;
      nodeIdMap?: Readonly<Record<string, string>>;
      edgeIdMap?: Readonly<Record<string, string>>;
      at: string;
    }
  | {
      type: "clipboard/paste-fragment";
      fragment: SystemDesignClipboardFragment;
      offset?: SystemDesignPoint;
      at: string;
    }
  | { type: "history/undo" }
  | { type: "history/redo" }
  | {
      type: "viewport/set";
      diagramId?: string;
      viewport: SystemDesignViewport;
      at: string;
    }
  | { type: "document/reset"; at: string }
  | {
      type: "document/replace";
      document: SystemDesignDocument;
      at: string;
    }
  | { type: "document/complete"; at: string }
  | {
      type: "layer/reorder";
      nodeId: string;
      direction: SystemDesignLayerDirection;
      at: string;
    }
  | {
      type: "layers/reorder-selection";
      nodeIds?: string[];
      direction: SystemDesignLayerDirection;
      at: string;
    }
  | { type: "preview/set"; enabled: boolean }
  | {
      type: "save/start";
      documentUpdatedAt: string;
    }
  | {
      type: "save/success";
      documentUpdatedAt: string;
      savedAt: string;
    }
  | {
      type: "save/failure";
      documentUpdatedAt: string;
      message: string;
    };

const now = (at?: string) => at ?? new Date().toISOString();

export const systemDesignEditorActions = {
  loadStart: (): SystemDesignEditorAction => ({ type: "load/start" }),
  loadSuccess: (
    document: SystemDesignDocument,
    persisted = true,
  ): SystemDesignEditorAction => ({
    type: "load/success",
    document,
    persisted,
  }),
  loadFailure: (message: string): SystemDesignEditorAction => ({
    type: "load/failure",
    message,
  }),
  activateDiagram: (diagramId: string): SystemDesignEditorAction => ({
    type: "diagram/activate",
    diagramId,
  }),
  openOrCreateModule: (
    nodeId: string,
    options: {
      childDiagramId?: string;
      at?: string;
    } = {},
  ): SystemDesignEditorAction => ({
    type: "module/open-or-create",
    nodeId,
    childDiagramId: options.childDiagramId,
    at: now(options.at),
  }),
  addNode: (
    node: SystemDesignNode,
    at?: string,
  ): SystemDesignEditorAction => ({
    type: "node/add",
    node,
    at: now(at),
  }),
  updateNode: (
    nodeId: string,
    changes: SystemDesignNodePatch,
    at?: string,
  ): SystemDesignEditorAction => ({
    type: "node/update",
    nodeId,
    changes,
    at: now(at),
  }),
  moveNodes: (
    positions: Readonly<Record<string, SystemDesignPoint>>,
    at?: string,
  ): SystemDesignEditorAction => ({
    type: "nodes/move",
    positions,
    at: now(at),
  }),
  arrangeNodes: (
    frames: Readonly<Record<string, SystemDesignRect>>,
    at?: string,
  ): SystemDesignEditorAction => ({
    type: "nodes/arrange",
    frames,
    at: now(at),
  }),
  setNodesState: (
    changes: { locked?: boolean; visible?: boolean },
    nodeIds?: string[],
    at?: string,
  ): SystemDesignEditorAction => ({
    type: "nodes/set-state",
    nodeIds,
    locked: changes.locked,
    visible: changes.visible,
    at: now(at),
  }),
  groupNodes: (
    nodeIds?: string[],
    options: { groupId?: string; at?: string } = {},
  ): SystemDesignEditorAction => ({
    type: "nodes/group",
    nodeIds,
    groupId: options.groupId,
    at: now(options.at),
  }),
  ungroupNodes: (
    nodeIds?: string[],
    at?: string,
  ): SystemDesignEditorAction => ({
    type: "nodes/ungroup",
    nodeIds,
    at: now(at),
  }),
  resizeNode: (
    nodeId: string,
    size: SystemDesignSize,
    position?: SystemDesignPoint,
    at?: string,
  ): SystemDesignEditorAction => ({
    type: "node/resize",
    nodeId,
    size,
    position,
    at: now(at),
  }),
  deleteNodes: (
    nodeIds: string[],
    at?: string,
  ): SystemDesignEditorAction => ({
    type: "nodes/delete",
    nodeIds,
    at: now(at),
  }),
  deleteEdges: (
    edgeIds: string[],
    at?: string,
  ): SystemDesignEditorAction => ({
    type: "edges/delete",
    edgeIds,
    at: now(at),
  }),
  deleteSelection: (at?: string): SystemDesignEditorAction => ({
    type: "selection/delete",
    at: now(at),
  }),
  duplicateNodes: (
    nodeIds?: string[],
    options: {
      offset?: SystemDesignPoint;
      nodeIdMap?: Readonly<Record<string, string>>;
      edgeIdMap?: Readonly<Record<string, string>>;
      at?: string;
    } = {},
  ): SystemDesignEditorAction => ({
    type: "nodes/duplicate",
    nodeIds,
    offset: options.offset,
    nodeIdMap: options.nodeIdMap,
    edgeIdMap: options.edgeIdMap,
    at: now(options.at),
  }),
  addEdge: (
    edge: SystemDesignEdge,
    at?: string,
  ): SystemDesignEditorAction => ({
    type: "edge/add",
    edge,
    at: now(at),
  }),
  updateEdge: (
    edgeId: string,
    changes: SystemDesignEdgePatch,
    at?: string,
  ): SystemDesignEditorAction => ({
    type: "edge/update",
    edgeId,
    changes,
    at: now(at),
  }),
  selectNodes: (
    nodeIds: string[],
    mode: SystemDesignSelectionMode = "replace",
  ): SystemDesignEditorAction => ({
    type: "selection/nodes",
    nodeIds,
    mode,
  }),
  selectEdges: (
    edgeIds: string[],
    mode: SystemDesignSelectionMode = "replace",
  ): SystemDesignEditorAction => ({
    type: "selection/edges",
    edgeIds,
    mode,
  }),
  clearSelection: (): SystemDesignEditorAction => ({
    type: "selection/clear",
  }),
  selectAll: (): SystemDesignEditorAction => ({
    type: "selection/all",
  }),
  copySelection: (
    fragment?: SystemDesignClipboardFragment,
  ): SystemDesignEditorAction => ({
    type: "clipboard/copy",
    fragment,
  }),
  cutSelection: (
    fragment?: SystemDesignClipboardFragment,
    at?: string,
  ): SystemDesignEditorAction => ({
    type: "clipboard/cut",
    fragment,
    at: now(at),
  }),
  pasteClipboard: (
    options: {
      offset?: SystemDesignPoint;
      nodeIdMap?: Readonly<Record<string, string>>;
      edgeIdMap?: Readonly<Record<string, string>>;
      at?: string;
    } = {},
  ): SystemDesignEditorAction => ({
    type: "clipboard/paste",
    offset: options.offset,
    nodeIdMap: options.nodeIdMap,
    edgeIdMap: options.edgeIdMap,
    at: now(options.at),
  }),
  pasteFragment: (
    fragment: SystemDesignClipboardFragment,
    options: { offset?: SystemDesignPoint; at?: string } = {},
  ): SystemDesignEditorAction => ({
    type: "clipboard/paste-fragment",
    fragment,
    offset: options.offset,
    at: now(options.at),
  }),
  undo: (): SystemDesignEditorAction => ({ type: "history/undo" }),
  redo: (): SystemDesignEditorAction => ({ type: "history/redo" }),
  setViewport: (
    viewport: SystemDesignViewport,
    at?: string,
    diagramId?: string,
  ): SystemDesignEditorAction => ({
    type: "viewport/set",
    diagramId,
    viewport,
    at: now(at),
  }),
  resetDocument: (at?: string): SystemDesignEditorAction => ({
    type: "document/reset",
    at: now(at),
  }),
  replaceDocument: (
    document: SystemDesignDocument,
    at?: string,
  ): SystemDesignEditorAction => ({
    type: "document/replace",
    document,
    at: now(at),
  }),
  markComplete: (at?: string): SystemDesignEditorAction => ({
    type: "document/complete",
    at: now(at),
  }),
  reorderLayer: (
    nodeId: string,
    direction: SystemDesignLayerDirection,
    at?: string,
  ): SystemDesignEditorAction => ({
    type: "layer/reorder",
    nodeId,
    direction,
    at: now(at),
  }),
  reorderSelectedLayers: (
    direction: SystemDesignLayerDirection,
    nodeIds?: string[],
    at?: string,
  ): SystemDesignEditorAction => ({
    type: "layers/reorder-selection",
    nodeIds,
    direction,
    at: now(at),
  }),
  setPreviewMode: (enabled: boolean): SystemDesignEditorAction => ({
    type: "preview/set",
    enabled,
  }),
  saveStarted: (
    documentUpdatedAt: string,
  ): SystemDesignEditorAction => ({
    type: "save/start",
    documentUpdatedAt,
  }),
  saveSucceeded: (
    documentUpdatedAt: string,
    savedAt = new Date().toISOString(),
  ): SystemDesignEditorAction => ({
    type: "save/success",
    documentUpdatedAt,
    savedAt,
  }),
  saveFailed: (
    documentUpdatedAt: string,
    message: string,
  ): SystemDesignEditorAction => ({
    type: "save/failure",
    documentUpdatedAt,
    message,
  }),
} satisfies Record<
  string,
  (...parameters: never[]) => SystemDesignEditorAction
>;

export type SystemDesignEditorDispatch = (
  action: SystemDesignEditorAction,
) => void;

export type SystemDesignEditorReducer = (
  state: SystemDesignEditorState,
  action: SystemDesignEditorAction,
) => SystemDesignEditorState;
