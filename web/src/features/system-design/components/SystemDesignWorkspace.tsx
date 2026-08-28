"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { AlertTriangle, LoaderCircle, MonitorUp, Radio } from "lucide-react";
import Link from "next/link";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  InlineNotice,
  LoadingSkeleton,
  Modal,
  buttonClass,
} from "@/features/admin/components/AdminPrimitives";
import {
  SYSTEM_DESIGN_NODE_TYPE_ORDER,
  isSystemDesignModuleNodeType,
} from "../constants/system-design-palette";
import { useSystemDesignKeyboardShortcuts } from "../hooks/use-system-design-keyboard-shortcuts";
import { useSystemDesignClipboard } from "../hooks/use-system-design-clipboard";
import { useSystemDesignPersistence } from "../hooks/use-system-design-persistence";
import { createSystemDesignRepository } from "../repository/createSystemDesignRepository";
import { systemDesignEditorActions } from "../state/system-design-editor-actions";
import {
  createSystemDesignEditorState,
  systemDesignEditorReducer,
} from "../state/system-design-editor-reducer";
import { applyCanvasOperation } from "../realtime/apply-canvas-operation";
import type { CanvasOperation } from "../realtime/canvas-operation";
import { useSystemDesignRealtime } from "../realtime/use-system-design-realtime";
import { useRemoteNodeDrags } from "../realtime/use-remote-node-drags";
import type {
  SystemDesignDocument,
  SystemDesignEditorTool,
  SystemDesignClipboardFragment,
  SystemDesignEdge,
  SystemDesignNode,
  SystemDesignNodeAsset,
  SystemDesignNodeType,
  SystemDesignPoint,
  SystemDesignProblem,
  SystemDesignViewport,
} from "../types/system-design.types";
import {
  readSystemDesignImportFile,
} from "../utils/diagram-import-export";
import { downloadInteractiveSystemDesignHtml } from "../utils/interactive-html-export";
import {
  DEFAULT_SYSTEM_DESIGN_VIEWPORT,
  countSystemDesignElements,
  createEmptySystemDesignDocument,
  createEmptyStandaloneSystemDesignDocument,
  createNextSystemDesignTimestamp,
  createSystemDesignNode,
  createSystemDesignFreehandNode,
  getSystemDesignDiagramBreadcrumbs,
  normalizeSystemDesignLayers,
} from "../utils/system-design-defaults";
import {
  alignSystemDesignNodes,
  distributeSystemDesignNodes,
  matchSystemDesignNodeSizes,
  spaceSystemDesignNodesEvenly,
} from "../utils/node-layout";
import { fitSystemDesignAssetFrame } from "../utils/system-design-assets";
import {
  SystemDesignCanvas,
  type SystemDesignCanvasHandle,
} from "./SystemDesignCanvas";
import {
  SystemDesignInspector,
  type SystemDesignInspectorTab,
} from "./SystemDesignInspector";
import { SystemDesignPalette } from "./SystemDesignPalette";
import { SystemDesignBreadcrumbs } from "./SystemDesignBreadcrumbs";
import { SystemDesignPerformancePanel } from "./SystemDesignPerformancePanel";
import { SystemDesignProblemPanel } from "./SystemDesignProblemPanel";
import {
  SystemDesignStatusBar,
  type SystemDesignSaveState,
} from "./SystemDesignStatusBar";
import {
  SystemDesignToolbar,
  type SystemDesignArrangeOperation,
} from "./SystemDesignToolbar";
import { SystemDesignLiveShareModal } from "./SystemDesignLiveShareModal";

export type SystemDesignWorkspaceMode =
  | { kind: "problem"; problem: SystemDesignProblem }
  | { kind: "standalone"; title?: string }
  | { kind: "live"; roomToken: string };

function isSystemDesignNodeType(
  value: string,
): value is SystemDesignNodeType {
  return (SYSTEM_DESIGN_NODE_TYPE_ORDER as readonly string[]).includes(value);
}

const SYSTEM_DESIGN_CREATION_TOOL_TYPES: Partial<
  Record<SystemDesignEditorTool, SystemDesignNodeType>
> = {
  text: "text",
  note: "note",
  boundary: "system_boundary",
  module: "module",
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function SmallScreenUnavailableMessage() {
  return (
    <div className="flex min-h-[calc(100vh-57px)] items-center justify-center p-6 md:hidden">
      <div className="max-w-md rounded-xl border border-border bg-surface p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
          <MonitorUp className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">
          The system-design editor needs a tablet-sized screen.
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Use a tablet or desktop screen at least 768 pixels wide.
        </p>
      </div>
    </div>
  );
}

function LiveSessionLoading({ reconnecting }: { reconnecting: boolean }) {
  return (
    <div className="hidden min-h-screen items-center justify-center bg-background p-6 md:flex">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-2xl">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
          <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-xl font-semibold">
          {reconnecting ? "Reconnecting…" : "Joining live session…"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {reconnecting
            ? "Restoring the latest shared canvas changes."
            : "Loading the shared canvas before opening the editor."}
        </p>
      </div>
    </div>
  );
}

function LiveSessionUnavailable({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="hidden min-h-screen items-center justify-center bg-background p-6 md:flex">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-8 shadow-2xl">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-danger/30 bg-danger/10 text-danger">
          <Radio className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {onRetry && (
            <button type="button" className={buttonClass} onClick={onRetry}>
              Try again
            </button>
          )}
          <Link href="/system-design" className={buttonClass}>
            Back to System Design
          </Link>
        </div>
      </div>
    </div>
  );
}

export function SystemDesignWorkspace({
  mode,
}: {
  mode: SystemDesignWorkspaceMode;
}) {
  const problem = mode.kind === "problem" ? mode.problem : undefined;
  const workspaceTitle =
    mode.kind === "problem"
      ? mode.problem.title
      : mode.kind === "standalone"
        ? mode.title ?? "Canvas"
        : "Live session";
  const fallbackDocument = useMemo(
    () =>
      problem
        ? createEmptySystemDesignDocument(problem)
        : createEmptyStandaloneSystemDesignDocument(workspaceTitle),
    [problem, workspaceTitle],
  );
  const repository = useMemo(() => createSystemDesignRepository(), []);
  const [state, dispatch] = useReducer(
    systemDesignEditorReducer,
    fallbackDocument,
    (document) =>
      createSystemDesignEditorState(document, { loadStatus: "idle" }),
  );
  const canvasRef = useRef<SystemDesignCanvasHandle>(null);
  const [inspectorTab, setInspectorTab] =
    useState<SystemDesignInspectorTab>("properties");
  const [resetOpen, setResetOpen] = useState(false);
  const [pendingImport, setPendingImport] =
    useState<SystemDesignDocument | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const [previewBriefOpen, setPreviewBriefOpen] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [snapToObjects, setSnapToObjects] = useState(true);
  const [activeTool, setActiveTool] =
    useState<SystemDesignEditorTool>("select");
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [pendingInlineEditNodeId, setPendingInlineEditNodeId] = useState<
    string | null
  >(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const activeDiagram =
    state.document.diagrams[state.activeDiagramId] ??
    state.document.diagrams[state.document.rootDiagramId];

  const applyRemoteNodePositions = useCallback(
    (
      diagramId: string,
      positions: Readonly<Record<string, SystemDesignPoint>>,
    ) => {
      if (stateRef.current.activeDiagramId !== diagramId) return;
      canvasRef.current?.applyRemoteNodePositions(positions);
    },
    [],
  );

  const clearRemoteNodePositions = useCallback(
    (diagramId: string, nodeIds: readonly string[]) => {
      if (stateRef.current.activeDiagramId !== diagramId) return;
      canvasRef.current?.clearRemoteNodePositions(nodeIds);
    },
    [],
  );

  const remoteNodeDrags = useRemoteNodeDrags({
    activeDiagramId: activeDiagram.id,
    onApplyPositions: applyRemoteNodePositions,
    onClearPositions: clearRemoteNodePositions,
  });

  const { save, retryLoad } = useSystemDesignPersistence({
    enabled: Boolean(problem),
    problemId: problem?.id,
    fallbackDocument,
    document: state.document,
    isDirty: state.isDirty,
    loadStatus: state.loadStatus,
    repository,
    dispatch,
    initializeWhenDisabled: mode.kind !== "live",
  });

  const handleInitialLiveDocument = useCallback(
    (document: SystemDesignDocument) => {
      remoteNodeDrags.clearAll();
      const action = systemDesignEditorActions.loadSuccess(document, false);
      stateRef.current = systemDesignEditorReducer(stateRef.current, action);
      dispatch(action);
    },
    [remoteNodeDrags],
  );

  const handleReplaceLiveDocument = useCallback(
    (document: SystemDesignDocument) => {
      remoteNodeDrags.clearAll();
      const action =
        systemDesignEditorActions.replaceCollaborationDocument(document);
      stateRef.current = systemDesignEditorReducer(stateRef.current, action);
      dispatch(action);
    },
    [remoteNodeDrags],
  );

  const handleRemoteCanvasOperation = useCallback(
    (operation: CanvasOperation) => {
      if (operation.kind === "node.move") {
        remoteNodeDrags.finishCommittedMove(
          operation.diagramId,
          operation.positions,
        );
      } else if (operation.kind === "node.delete") {
        remoteNodeDrags.clearCommittedNodes(
          operation.diagramId,
          operation.nodeIds,
        );
      }
      const applied = applyCanvasOperation(stateRef.current, operation);
      stateRef.current = applied.state;
      dispatch(applied.action);
    },
    [remoteNodeDrags],
  );

  const realtime = useSystemDesignRealtime({
    initialRoomToken: mode.kind === "live" ? mode.roomToken : undefined,
    onInitialDocument: handleInitialLiveDocument,
    onReplaceDocument: handleReplaceLiveDocument,
    onRemoteOperation: handleRemoteCanvasOperation,
    onRemoteDragOperation: remoteNodeDrags.receive,
  });
  const collaborationActive =
    mode.kind === "live" || realtime.roomToken !== null;

  const commitCanvasOperation = useCallback(
    (operation: CanvasOperation) => {
      const applied = applyCanvasOperation(stateRef.current, operation, {
        selectAddedNode: operation.kind === "node.add",
      });
      stateRef.current = applied.state;
      dispatch(applied.action);
      if (collaborationActive) {
        realtime.sendCommittedOperation(
          applied.operation,
          applied.state.document,
        );
      }
      return applied.operation;
    },
    [collaborationActive, realtime],
  );

  const documentCounts = useMemo(
    () => countSystemDesignElements(state.document),
    [state.document],
  );
  const breadcrumbSegments = useMemo(
    () =>
      getSystemDesignDiagramBreadcrumbs(
        state.document,
        activeDiagram.id,
      ).map((diagram) => ({
        diagramId: diagram.id,
        label: diagram.name,
      })),
    [activeDiagram.id, state.document],
  );
  const internalComponentCounts = useMemo(
    () =>
      Object.fromEntries(
        activeDiagram.nodes.flatMap((node) => {
          if (!node.childDiagramId) return [];
          const child = state.document.diagrams[node.childDiagramId];
          return child ? [[node.id, child.nodes.length] as const] : [];
        }),
      ),
    [activeDiagram.nodes, state.document.diagrams],
  );
  const parentBreadcrumbSegment = breadcrumbSegments.at(-2);

  const selectedNodes = useMemo(
    () =>
      activeDiagram.nodes.filter((node) =>
        state.selectedNodeIds.includes(node.id),
      ),
    [activeDiagram.nodes, state.selectedNodeIds],
  );

  const selectedNode =
    state.selectedNodeIds.length === 1
      ? activeDiagram.nodes.find(
          (node) => node.id === state.selectedNodeIds[0],
        ) ?? null
      : null;
  const selectedEdge =
    state.selectedEdgeIds.length === 1
      ? activeDiagram.edges.find(
          (edge) => edge.id === state.selectedEdgeIds[0],
        ) ?? null
      : null;
  const selectedCount =
    state.selectedNodeIds.length + state.selectedEdgeIds.length;

  const saveState: SystemDesignSaveState =
    state.saveStatus === "saving"
      ? "saving"
      : state.saveStatus === "error"
        ? "error"
        : state.isDirty
          ? "unsaved"
          : state.saveStatus === "idle"
            ? "idle"
            : "saved";

  const handleSave = useCallback(() => {
    void save();
  }, [save]);

  const handleDelete = useCallback(() => {
    const current = stateRef.current;
    const diagram = current.document.diagrams[current.activeDiagramId];
    const selectedNodeIds = diagram
      ? current.selectedNodeIds.filter((nodeId) =>
          diagram.nodes.some((node) => node.id === nodeId && !node.locked),
        )
      : [];
    const action = systemDesignEditorActions.deleteSelection();
    const next = systemDesignEditorReducer(current, action);
    stateRef.current = next;
    dispatch(action);
    if (collaborationActive && diagram && selectedNodeIds.length > 0) {
      realtime.sendCommittedOperation(
        {
          kind: "node.delete",
          diagramId: diagram.id,
          nodeIds: selectedNodeIds,
        },
        next.document,
      );
    }
  }, [collaborationActive, realtime]);

  const handleDuplicate = useCallback(() => {
    dispatch(systemDesignEditorActions.duplicateNodes());
  }, []);

  const handleSetSelectionLocked = useCallback((locked: boolean) => {
    dispatch(systemDesignEditorActions.setNodesState({ locked }));
  }, []);

  const handleSetSelectionVisible = useCallback((visible: boolean) => {
    dispatch(systemDesignEditorActions.setNodesState({ visible }));
  }, []);

  const handleGroupSelection = useCallback(() => {
    dispatch(systemDesignEditorActions.groupNodes());
  }, []);

  const handleUngroupSelection = useCallback(() => {
    dispatch(systemDesignEditorActions.ungroupNodes());
  }, []);

  const handleSelectAll = useCallback(() => {
    dispatch(systemDesignEditorActions.selectAll());
  }, []);

  const handleClearSelection = useCallback(() => {
    dispatch(systemDesignEditorActions.clearSelection());
  }, []);

  const handleEscape = useCallback(() => {
    setActiveTool("select");
    dispatch(systemDesignEditorActions.clearSelection());
  }, []);

  const handleUndo = useCallback(() => {
    if (collaborationActive) return;
    dispatch(systemDesignEditorActions.undo());
  }, [collaborationActive]);

  const handleRedo = useCallback(() => {
    if (collaborationActive) return;
    dispatch(systemDesignEditorActions.redo());
  }, [collaborationActive]);

  const handleOpenModule = useCallback((nodeId: string) => {
    dispatch(systemDesignEditorActions.openOrCreateModule(nodeId));
  }, []);

  const handleNavigateDiagram = useCallback((diagramId: string) => {
    dispatch(systemDesignEditorActions.activateDiagram(diagramId));
  }, []);

  const handleNavigateParent = useCallback(() => {
    if (parentBreadcrumbSegment) {
      dispatch(
        systemDesignEditorActions.activateDiagram(
          parentBreadcrumbSegment.diagramId,
        ),
      );
    }
  }, [parentBreadcrumbSegment]);

  const handleOpenSelectedModule = useCallback(() => {
    if (
      selectedNode &&
      isSystemDesignModuleNodeType(selectedNode.type) &&
      selectedNode.isExpandable !== false
    ) {
      dispatch(systemDesignEditorActions.openOrCreateModule(selectedNode.id));
    }
  }, [selectedNode]);

  const handleNativeCopy = useCallback(
    (fragment: SystemDesignClipboardFragment) => {
      dispatch(systemDesignEditorActions.copySelection(fragment));
    },
    [],
  );

  const handleNativeCut = useCallback(
    (fragment?: SystemDesignClipboardFragment) => {
      dispatch(systemDesignEditorActions.cutSelection(fragment));
    },
    [],
  );

  const handlePasteFragment = useCallback(
    (fragment: SystemDesignClipboardFragment) => {
      dispatch(systemDesignEditorActions.pasteFragment(fragment));
    },
    [],
  );

  const handlePasteText = useCallback(
    (text: string) => {
      const normalized = text.replace(/\r\n?/g, "\n");
      if (!normalized.trim()) return;
      const center = canvasRef.current?.getVisibleCenter() ?? {
        x: 480,
        y: 320,
      };
      const lines = normalized.split("\n");
      const longestLine = Math.max(...lines.map((line) => line.length));
      const width = Math.min(440, Math.max(220, longestLine * 8 + 32));
      const height = Math.min(320, Math.max(96, lines.length * 22 + 32));
      const node = createSystemDesignNode("text", center, {
        label: normalized,
        parentModuleId: activeDiagram.parentNodeId,
      });
      dispatch(
        systemDesignEditorActions.addNode({
          ...node,
          x: center.x - width / 2,
          y: center.y - height / 2,
          width,
          height,
        }),
      );
      setInspectorTab("properties");
      setPendingInlineEditNodeId(node.id);
    },
    [activeDiagram.parentNodeId],
  );

  const handlePasteAsset = useCallback(
    (asset: SystemDesignNodeAsset) => {
      const center = canvasRef.current?.getVisibleCenter() ?? {
        x: 480,
        y: 320,
      };
      const frame = fitSystemDesignAssetFrame(asset);
      const node = createSystemDesignNode("image", center, {
        label: "",
        asset,
        parentModuleId: activeDiagram.parentNodeId,
      });
      dispatch(
        systemDesignEditorActions.addNode({
          ...node,
          x: center.x - frame.width / 2,
          y: center.y - frame.height / 2,
          ...frame,
        }),
      );
      setInspectorTab("properties");
    },
    [activeDiagram.parentNodeId],
  );

  useEffect(() => {
    if (
      !pendingInlineEditNodeId ||
      !activeDiagram.nodes.some((node) => node.id === pendingInlineEditNodeId)
    ) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      canvasRef.current?.startInlineEdit(pendingInlineEditNodeId);
      setPendingInlineEditNodeId((current) =>
        current === pendingInlineEditNodeId ? null : current,
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [activeDiagram.nodes, pendingInlineEditNodeId]);

  useSystemDesignClipboard({
    enabled: state.loadStatus === "ready" && !state.isPreviewMode,
    document: state.document,
    activeDiagramId: activeDiagram.id,
    selectedNodeIds: state.selectedNodeIds,
    hasSelection: selectedCount > 0,
    onCopy: handleNativeCopy,
    onCut: handleNativeCut,
    onPasteFragment: handlePasteFragment,
    onPasteText: handlePasteText,
    onPasteAsset: handlePasteAsset,
    onError: setUiError,
  });

  useSystemDesignKeyboardShortcuts({
    enabled: state.loadStatus === "ready",
    canUndo: !state.isPreviewMode && state.history.length > 0,
    canRedo: !state.isPreviewMode && state.future.length > 0,
    hasSelection: !state.isPreviewMode && selectedCount > 0,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onSelectAll: handleSelectAll,
    onDuplicate: handleDuplicate,
    onDelete: handleDelete,
    onClearSelection: handleEscape,
    onSave: handleSave,
    canNavigateParent: Boolean(parentBreadcrumbSegment),
    onNavigateParent: handleNavigateParent,
    canOpenSelectedModule:
      Boolean(
        selectedNode &&
          isSystemDesignModuleNodeType(selectedNode.type) &&
          selectedNode.isExpandable !== false,
      ),
    onOpenSelectedModule: handleOpenSelectedModule,
  });

  const addNode = useCallback(
    (
      type: SystemDesignNodeType,
      center: { x: number; y: number },
      arrangeAroundCenter: boolean,
    ) => {
      const index = activeDiagram.nodes.length;
      const node = createSystemDesignNode(type, center, {
        parentModuleId: activeDiagram.parentNodeId,
        isExpandable: isSystemDesignModuleNodeType(type) ? true : undefined,
      });
      const column = index % 3;
      const row = Math.floor(index / 3) % 3;
      const x = arrangeAroundCenter
        ? center.x + (column - 1) * 210 - node.width / 2
        : center.x - node.width / 2;
      const y = arrangeAroundCenter
        ? center.y + (row - 1) * 130 - node.height / 2
        : center.y - node.height / 2;
      const positionedNode = {
        ...node,
        x,
        y,
      };
      commitCanvasOperation({
        kind: "node.add",
        diagramId: activeDiagram.id,
        node: positionedNode,
      });
      setInspectorTab("properties");
      return node.id;
    },
    [
      activeDiagram.id,
      activeDiagram.nodes.length,
      activeDiagram.parentNodeId,
      commitCanvasOperation,
    ],
  );

  const addNodeFromPalette = useCallback(
    (type: SystemDesignNodeType) => {
      addNode(
        type,
        canvasRef.current?.getVisibleCenter() ?? { x: 480, y: 320 },
        true,
      );
    },
    [addNode],
  );

  const addDroppedNode = useCallback(
    (type: string, position: { x: number; y: number }) => {
      if (!isSystemDesignNodeType(type)) return;
      addNode(type, position, false);
    },
    [addNode],
  );

  const addFreehandStroke = useCallback(
    (points: readonly SystemDesignPoint[]) => {
      const node = createSystemDesignFreehandNode(points, {
        parentModuleId: activeDiagram.parentNodeId,
      });
      if (!node) return;
      dispatch(systemDesignEditorActions.addNode(node));
    },
    [activeDiagram.parentNodeId],
  );

  const handleToolChange = useCallback(
    (tool: SystemDesignEditorTool) => {
      if (tool === "draw" && activeTool === "draw") {
        setActiveTool("select");
        return;
      }
      const nodeType = SYSTEM_DESIGN_CREATION_TOOL_TYPES[tool];
      if (nodeType) {
        const nodeId = addNode(
          nodeType,
          canvasRef.current?.getVisibleCenter() ?? { x: 480, y: 320 },
          false,
        );
        if (tool === "text") setPendingInlineEditNodeId(nodeId);
        setActiveTool("select");
        return;
      }
      setActiveTool(tool);
    },
    [activeTool, addNode],
  );

  const handleImport = useCallback(
    async (file: File) => {
      setUiError(null);
      try {
        setPendingImport(
          await readSystemDesignImportFile(file, problem?.id),
        );
      } catch (error) {
        setPendingImport(null);
        setUiError(
          getErrorMessage(
            error,
            "The selected diagram could not be imported.",
          ),
        );
      }
    },
    [problem],
  );

  const handleExport = useCallback(() => {
    setUiError(null);
    try {
      downloadInteractiveSystemDesignHtml(
        state.document,
        problem
          ? { mode: "full", problem }
          : { mode: "diagram-only" },
      );
    } catch (error) {
      setUiError(
        getErrorMessage(
          error,
          "The interactive diagram could not be downloaded.",
        ),
      );
    }
  }, [problem, state.document]);

  const handleLiveShare = useCallback(() => {
    setShareModalOpen(true);
    if (
      realtime.roomToken === null &&
      realtime.status !== "starting" &&
      realtime.status !== "connecting"
    ) {
      void realtime.startLiveSession(stateRef.current.document);
    }
  }, [realtime]);

  const handleRetryLiveShare = useCallback(() => {
    if (realtime.roomToken) {
      realtime.retryConnection();
      return;
    }
    void realtime.startLiveSession(stateRef.current.document);
  }, [realtime]);

  const togglePreview = useCallback(() => {
    const enabled = !state.isPreviewMode;
    setPreviewBriefOpen(true);
    setActiveTool("select");
    dispatch(systemDesignEditorActions.setPreviewMode(enabled));
  }, [state.isPreviewMode]);

  const handleMarkComplete = useCallback(() => {
    if (
      documentCounts.nodeCount === 0 ||
      state.document.status === "completed"
    ) {
      return;
    }
    const at = createNextSystemDesignTimestamp(
      state.document.updatedAt,
    );
    const completedDocument: SystemDesignDocument = {
      ...state.document,
      status: "completed",
      updatedAt: at,
    };
    dispatch(systemDesignEditorActions.markComplete(at));
    void save(completedDocument);
  }, [documentCounts.nodeCount, save, state.document]);

  const handleConfirmReset = useCallback(() => {
    const at = createNextSystemDesignTimestamp(
      state.document.updatedAt,
    );
    const resetDocument: SystemDesignDocument = {
      ...state.document,
      status: "in_progress",
      diagrams: {
        [state.document.rootDiagramId]: {
          ...state.document.diagrams[state.document.rootDiagramId],
          parentNodeId: undefined,
          nodes: [],
          edges: [],
          viewport: { ...DEFAULT_SYSTEM_DESIGN_VIEWPORT },
        },
      },
      updatedAt: at,
    };
    dispatch(systemDesignEditorActions.resetDocument(at));
    setResetOpen(false);
    void save(resetDocument);
  }, [save, state.document]);

  const handleConfirmImport = useCallback(() => {
    if (!pendingImport) return;
    const at = createNextSystemDesignTimestamp(
      state.document.updatedAt,
    );
    const importedDocument: SystemDesignDocument = {
      ...pendingImport,
      ...(problem ? { problemId: problem.id } : {}),
      diagrams: Object.fromEntries(
        Object.entries(pendingImport.diagrams).map(
          ([diagramId, diagram]) => [
            diagramId,
            {
              ...diagram,
              nodes: normalizeSystemDesignLayers(diagram.nodes),
            },
          ],
        ),
      ),
      updatedAt: at,
    };
    if (!problem) delete importedDocument.problemId;
    dispatch(
      systemDesignEditorActions.replaceDocument(importedDocument, at),
    );
    setPendingImport(null);
    void save(importedDocument);
  }, [pendingImport, problem, save, state.document.updatedAt]);

  const handleSelectNode = useCallback(
    (nodeId: string, additive: boolean) => {
      dispatch(
        systemDesignEditorActions.selectNodes(
          [nodeId],
          additive ? "toggle" : "replace",
        ),
      );
      setInspectorTab("properties");
    },
    [],
  );

  const handleSelectNodes = useCallback(
    (
      nodeIds: string[],
      mode: "replace" | "add" | "toggle",
    ) => {
      dispatch(systemDesignEditorActions.selectNodes(nodeIds, mode));
      setInspectorTab("properties");
    },
    [],
  );

  const handleSelectEdge = useCallback(
    (edgeId: string, additive: boolean) => {
      dispatch(
        systemDesignEditorActions.selectEdges(
          [edgeId],
          additive ? "toggle" : "replace",
        ),
      );
      setInspectorTab("properties");
    },
    [],
  );

  const handleMoveNodes = useCallback(
    (changes: Array<{ id: string; x: number; y: number }>) => {
      const positions = Object.fromEntries(
        changes.map(({ id, x, y }) => [id, { x, y }]),
      );
      commitCanvasOperation({
        kind: "node.move",
        diagramId: activeDiagram.id,
        positions,
      });
    },
    [activeDiagram.id, commitCanvasOperation],
  );

  const handleNodeDragStart = useCallback(
    (nodeIds: readonly string[]) => {
      realtime.beginNodeDrag(activeDiagram.id, nodeIds);
    },
    [activeDiagram.id, realtime],
  );

  const handleNodeDragPreview = useCallback(
    (changes: readonly { id: string; x: number; y: number }[]) => {
      realtime.previewNodeDrag(
        Object.fromEntries(
          changes.map(({ id, x, y }) => [id, { x, y }]),
        ),
      );
    },
    [realtime],
  );

  const handleNodeDragEnd = useCallback(() => {
    realtime.endNodeDrag();
  }, [realtime]);

  const handleResizeNode = useCallback(
    ({
      id,
      x,
      y,
      width,
      height,
    }: {
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }) => {
      dispatch(
        systemDesignEditorActions.resizeNode(
          id,
          { width, height },
          { x, y },
        ),
      );
    },
    [],
  );

  const handleAddEdge = useCallback(
    (edge: SystemDesignEdge) => {
      dispatch(systemDesignEditorActions.addEdge(edge));
      if (activeTool === "connect") setActiveTool("select");
    },
    [activeTool],
  );

  const handleViewportChange = useCallback(
    (viewport: SystemDesignViewport) => {
      dispatch(
        systemDesignEditorActions.setViewport(
          viewport,
          undefined,
          activeDiagram.id,
        ),
      );
    },
    [activeDiagram.id],
  );

  const handleInlineLabelEdit = useCallback(
    (nodeId: string, label: string) => {
      dispatch(systemDesignEditorActions.updateNode(nodeId, { label }));
    },
    [],
  );

  const handleInlineEdgeLabelEdit = useCallback(
    (edgeId: string, label: string) => {
      dispatch(systemDesignEditorActions.updateEdge(edgeId, { label }));
    },
    [],
  );

  const handleArrange = useCallback(
    (operation: SystemDesignArrangeOperation) => {
      const nodes: SystemDesignNode[] = selectedNodes;
      if (operation === "match-width" || operation === "match-height") {
        const frames = matchSystemDesignNodeSizes(
          nodes,
          operation === "match-width" ? "width" : "height",
        );
        if (Object.keys(frames).length > 0) {
          dispatch(systemDesignEditorActions.arrangeNodes(frames));
        }
        return;
      }
      const positions =
        operation === "distribute-horizontal"
          ? distributeSystemDesignNodes(nodes, "horizontal")
          : operation === "distribute-vertical"
            ? distributeSystemDesignNodes(nodes, "vertical")
            : operation === "equal-horizontal-spacing"
              ? spaceSystemDesignNodesEvenly(nodes, "horizontal")
              : operation === "equal-vertical-spacing"
                ? spaceSystemDesignNodesEvenly(nodes, "vertical")
            : alignSystemDesignNodes(
                nodes,
                operation.replace("align-", "") as
                  | "left"
                  | "center"
                  | "right"
                  | "top"
                  | "middle"
                  | "bottom",
              );
      if (Object.keys(positions).length > 0) {
        dispatch(systemDesignEditorActions.moveNodes(positions));
      }
    },
    [selectedNodes],
  );

  const layersProps = {
    nodes: activeDiagram.nodes,
    selectedNodeIds: state.selectedNodeIds,
    onSelectNode: (nodeId: string, additive: boolean) =>
      dispatch(
        systemDesignEditorActions.selectNodes(
          [nodeId],
          additive ? "toggle" : "replace",
        ),
      ),
    onRenameNode: (nodeId: string, label: string) =>
      dispatch(systemDesignEditorActions.updateNode(nodeId, { label })),
    onToggleVisibility: (nodeId: string) => {
      const node = activeDiagram.nodes.find(
        (candidate) => candidate.id === nodeId,
      );
      if (node) {
        dispatch(
          systemDesignEditorActions.updateNode(nodeId, {
            visible: !node.visible,
          }),
        );
      }
    },
    onToggleLocked: (nodeId: string) => {
      const node = activeDiagram.nodes.find(
        (candidate) => candidate.id === nodeId,
      );
      if (node) {
        dispatch(
          systemDesignEditorActions.updateNode(nodeId, {
            locked: !node.locked,
          }),
        );
      }
    },
    onMoveForward: (nodeId: string) =>
      dispatch(systemDesignEditorActions.reorderLayer(nodeId, "forward")),
    onMoveBackward: (nodeId: string) =>
      dispatch(systemDesignEditorActions.reorderLayer(nodeId, "backward")),
    onBringToFront: (nodeId: string) =>
      dispatch(systemDesignEditorActions.reorderLayer(nodeId, "front")),
    onSendToBack: (nodeId: string) =>
      dispatch(systemDesignEditorActions.reorderLayer(nodeId, "back")),
  };

  const editor = (
    <div
      className={`hidden min-h-[38rem] flex-col overflow-hidden md:flex ${
        mode.kind === "live" ? "h-dvh" : "h-[calc(100dvh-57px)]"
      }`}
    >
      <SystemDesignToolbar
        onBack={parentBreadcrumbSegment ? handleNavigateParent : undefined}
        backLabel={
          parentBreadcrumbSegment
            ? `Back to ${parentBreadcrumbSegment.label}`
            : mode.kind === "standalone" || mode.kind === "live"
              ? "Back to system design"
              : "Back to system design problems"
        }
        className="shrink-0 overflow-x-auto"
        title={mode.kind === "live" ? state.document.title : workspaceTitle}
        difficulty={problem?.difficulty}
        showLearningActions={Boolean(problem)}
        saveState={saveState}
        isCompleted={state.document.status === "completed"}
        isPreviewMode={state.isPreviewMode}
        zoom={activeDiagram.viewport.zoom}
        canUndo={!collaborationActive && state.history.length > 0}
        canRedo={!collaborationActive && state.future.length > 0}
        undoDisabledReason={
          collaborationActive
            ? "Undo is unavailable during live sessions"
            : undefined
        }
        canSave={state.loadStatus === "ready"}
        canMarkComplete={documentCounts.nodeCount > 0}
        showGrid={showGrid}
        snapToGrid={snapToGrid}
        snapToObjects={snapToObjects}
        activeTool={activeTool}
        selectedNodeCount={state.selectedNodeIds.length}
        selectedNodes={selectedNodes}
        selectedEdge={selectedEdge}
        animationsEnabled={animationsEnabled}
        liveShareStatus={realtime.status}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onLiveShare={handleLiveShare}
        onSave={handleSave}
        onMarkComplete={handleMarkComplete}
        onTogglePreview={togglePreview}
        onResetCanvas={() => setResetOpen(true)}
        onImportFile={(file) => void handleImport(file)}
        onExport={handleExport}
        onFitToScreen={() => canvasRef.current?.fitToScreen()}
        onResetViewport={() => canvasRef.current?.resetViewport()}
        onZoomOut={() => canvasRef.current?.zoomBy(1 / 1.15)}
        onZoomIn={() => canvasRef.current?.zoomBy(1.15)}
        onToggleGrid={() => setShowGrid((visible) => !visible)}
        onToggleSnapToGrid={() => setSnapToGrid((enabled) => !enabled)}
        onToggleSnapToObjects={() =>
          setSnapToObjects((enabled) => !enabled)
        }
        onToolChange={handleToolChange}
        onArrange={handleArrange}
        onDuplicateSelection={handleDuplicate}
        onSetSelectionLocked={handleSetSelectionLocked}
        onSetSelectionVisible={handleSetSelectionVisible}
        onReorderSelection={(direction) =>
          dispatch(
            systemDesignEditorActions.reorderSelectedLayers(direction),
          )
        }
        onGroupSelection={handleGroupSelection}
        onUngroupSelection={handleUngroupSelection}
        onDeleteSelection={handleDelete}
        onUpdateSelectedNodeText={(textStyle) => {
          if (!selectedNode) return;
          dispatch(
            systemDesignEditorActions.updateNode(selectedNode.id, {
              textStyle,
            }),
          );
        }}
        onUpdateSelectedEdge={(patch) => {
          if (selectedEdge) {
            dispatch(
              systemDesignEditorActions.updateEdge(selectedEdge.id, patch),
            );
          }
        }}
        onToggleAnimations={() =>
          setAnimationsEnabled((enabled) => !enabled)
        }
      />

      <div className="flex min-h-9 shrink-0 items-center border-b border-border bg-surface/80 px-3">
        <SystemDesignBreadcrumbs
          segments={breadcrumbSegments}
          onNavigate={handleNavigateDiagram}
        />
      </div>

      <div className="relative flex min-h-0 flex-1">
        {!state.isPreviewMode && (
          <SystemDesignPalette onAddNode={addNodeFromPalette} />
        )}
        <div className="relative min-w-0 flex-1">
          <SystemDesignCanvas
            ref={canvasRef}
            diagram={activeDiagram}
            selectedNodeIds={state.selectedNodeIds}
            selectedEdgeIds={state.selectedEdgeIds}
            preview={state.isPreviewMode}
            showGrid={showGrid}
            snapToGrid={snapToGrid}
            snapToObjects={snapToObjects}
            activeTool={activeTool}
            animationsEnabled={animationsEnabled}
            remotelyDraggedNodeIds={remoteNodeDrags.remotelyDraggedNodeIds}
            internalComponentCounts={internalComponentCounts}
            onSelectNode={handleSelectNode}
            onSelectNodes={handleSelectNodes}
            onSelectEdge={handleSelectEdge}
            onClearSelection={handleClearSelection}
            onMoveNodes={handleMoveNodes}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragPreview={handleNodeDragPreview}
            onNodeDragEnd={handleNodeDragEnd}
            onResizeNode={handleResizeNode}
            onAddEdge={handleAddEdge}
            onAddFreehand={addFreehandStroke}
            onViewportChange={handleViewportChange}
            onDropNodeType={addDroppedNode}
            onOpenModule={handleOpenModule}
            onEditNodeLabel={handleInlineLabelEdit}
            onEditEdgeLabel={handleInlineEdgeLabelEdit}
          />
          <SystemDesignPerformancePanel />

          {state.isPreviewMode && problem && (
            <details
              open={previewBriefOpen}
              onToggle={(event) =>
                setPreviewBriefOpen(event.currentTarget.open)
              }
              className="absolute left-4 top-4 z-10 w-80 max-w-[calc(100%-2rem)] overflow-hidden rounded-lg border border-border bg-surface/95 shadow-2xl backdrop-blur"
            >
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
                Problem brief
              </summary>
              <div className="max-h-[60vh] overflow-y-auto border-t border-border p-4">
                <SystemDesignProblemPanel problem={problem} />
              </div>
            </details>
          )}

          {(uiError || state.saveError) && (
            <div className="absolute right-4 top-4 z-20 w-full max-w-md">
              <InlineNotice tone="danger">
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p>{uiError || state.saveError}</p>
                    {state.saveError && (
                      <button
                        type="button"
                        className="mt-2 text-xs font-semibold underline underline-offset-4"
                        onClick={handleSave}
                      >
                        Retry save
                      </button>
                    )}
                  </div>
                </div>
              </InlineNotice>
            </div>
          )}
        </div>

        {!state.isPreviewMode && (
          <SystemDesignInspector
            activeTab={inspectorTab}
            onTabChange={setInspectorTab}
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            selectedCount={selectedCount}
            selectedNodeInternalComponentCount={
              selectedNode
                ? internalComponentCounts[selectedNode.id]
                : undefined
            }
            problem={problem}
            layersProps={layersProps}
            onUpdateNode={(nodeId, patch) =>
              dispatch(
                systemDesignEditorActions.updateNode(nodeId, patch),
              )
            }
            onUpdateEdge={(edgeId, patch) =>
              dispatch(
                systemDesignEditorActions.updateEdge(edgeId, patch),
              )
            }
            onOpenModule={handleOpenModule}
          />
        )}
      </div>

      <SystemDesignStatusBar
        nodeCount={activeDiagram.nodes.length}
        edgeCount={activeDiagram.edges.length}
        selectedCount={selectedCount}
        zoom={activeDiagram.viewport.zoom}
        saveState={saveState}
        lastSavedAt={state.lastSavedAt}
        saveError={state.saveError}
        isPersistent={Boolean(problem)}
      />
    </div>
  );

  return (
    <>
      <SmallScreenUnavailableMessage />
      {mode.kind === "live" &&
      (state.loadStatus === "loading" || state.loadStatus === "idle") ? (
        realtime.failure ? (
          <LiveSessionUnavailable
            title={
              realtime.failure.kind === "ended"
                ? "This live session has ended"
                : realtime.failure.kind === "room_full"
                  ? "This live session is full"
                  : "Couldn't join the live session"
            }
            description={realtime.failure.message}
            onRetry={
              realtime.failure.kind === "connection_failed"
                ? realtime.retryConnection
                : undefined
            }
          />
        ) : (
          <LiveSessionLoading
            reconnecting={realtime.status === "reconnecting"}
          />
        )
      ) : state.loadStatus === "loading" || state.loadStatus === "idle" ? (
        <div className="hidden min-h-[calc(100vh-57px)] p-6 md:block">
          <LoadingSkeleton rows={9} />
        </div>
      ) : state.loadStatus === "error" ? (
        <div className="hidden min-h-[calc(100vh-57px)] p-6 md:block">
          <ErrorState
            title="Could not load the locally saved diagram"
            description={
              state.loadError ||
              "Check that browser storage is available, then try again."
            }
            action={
              <button type="button" className={buttonClass} onClick={retryLoad}>
                Try again
              </button>
            }
          />
        </div>
      ) : (
        editor
      )}

      <Modal
        open={resetOpen}
        title="Reset canvas?"
        description="This removes every component and connection and resets the viewport. You can undo the reset until you leave the editor."
        confirmLabel="Reset canvas"
        destructive
        onClose={() => setResetOpen(false)}
        onConfirm={handleConfirmReset}
      />

      <Modal
        open={pendingImport !== null}
        title="Replace the current diagram?"
        description="Importing this JSON file replaces the current canvas. The replacement is added to undo history."
        confirmLabel="Import diagram"
        destructive
        onClose={() => setPendingImport(null)}
        onConfirm={handleConfirmImport}
      />

      <SystemDesignLiveShareModal
        open={shareModalOpen}
        status={realtime.status}
        failure={realtime.failure}
        shareUrl={realtime.shareUrl}
        isSlow={realtime.isSlow}
        onClose={() => setShareModalOpen(false)}
        onRetry={handleRetryLiveShare}
      />
    </>
  );
}
