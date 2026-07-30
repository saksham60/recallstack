"use client";

import {
  useCallback,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { AlertTriangle, MonitorUp } from "lucide-react";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  InlineNotice,
  LoadingSkeleton,
  Modal,
  buttonClass,
} from "@/features/admin/components/AdminPrimitives";
import { SYSTEM_DESIGN_NODE_TYPE_ORDER } from "../constants/system-design-palette";
import { useSystemDesignKeyboardShortcuts } from "../hooks/use-system-design-keyboard-shortcuts";
import { useSystemDesignPersistence } from "../hooks/use-system-design-persistence";
import { createSystemDesignRepository } from "../repository/createSystemDesignRepository";
import { systemDesignEditorActions } from "../state/system-design-editor-actions";
import {
  createSystemDesignEditorState,
  systemDesignEditorReducer,
} from "../state/system-design-editor-reducer";
import type {
  SystemDesignDocument,
  SystemDesignEdge,
  SystemDesignNodeType,
  SystemDesignProblem,
  SystemDesignViewport,
} from "../types/system-design.types";
import {
  downloadSystemDesignDocument,
  readSystemDesignImportFile,
} from "../utils/diagram-import-export";
import {
  DEFAULT_SYSTEM_DESIGN_VIEWPORT,
  createEmptySystemDesignDocument,
  createNextSystemDesignTimestamp,
  createSystemDesignNode,
  normalizeSystemDesignLayers,
} from "../utils/system-design-defaults";
import {
  SystemDesignCanvas,
  type SystemDesignCanvasHandle,
} from "./SystemDesignCanvas";
import {
  SystemDesignInspector,
  type SystemDesignInspectorTab,
} from "./SystemDesignInspector";
import { SystemDesignPalette } from "./SystemDesignPalette";
import { SystemDesignProblemPanel } from "./SystemDesignProblemPanel";
import {
  SystemDesignStatusBar,
  type SystemDesignSaveState,
} from "./SystemDesignStatusBar";
import { SystemDesignToolbar } from "./SystemDesignToolbar";

function isSystemDesignNodeType(
  value: string,
): value is SystemDesignNodeType {
  return (SYSTEM_DESIGN_NODE_TYPE_ORDER as readonly string[]).includes(value);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function DesktopUnavailableMessage() {
  return (
    <div className="flex min-h-[calc(100vh-57px)] items-center justify-center p-6 lg:hidden">
      <div className="max-w-md rounded-xl border border-border bg-surface p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
          <MonitorUp className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">
          The system-design editor is currently available on desktop screens.
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Use a screen at least 1024 pixels wide to build and edit diagrams.
        </p>
      </div>
    </div>
  );
}

export function SystemDesignWorkspace({
  problem,
}: {
  problem: SystemDesignProblem;
}) {
  const fallbackDocument = useMemo(
    () => createEmptySystemDesignDocument(problem),
    [problem],
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

  const { save, retryLoad } = useSystemDesignPersistence({
    problemId: problem.id,
    fallbackDocument,
    document: state.document,
    isDirty: state.isDirty,
    loadStatus: state.loadStatus,
    repository,
    dispatch,
  });

  const selectedNode =
    state.selectedNodeIds.length === 1
      ? state.document.nodes.find(
          (node) => node.id === state.selectedNodeIds[0],
        ) ?? null
      : null;
  const selectedEdge =
    state.selectedEdgeIds.length === 1
      ? state.document.edges.find(
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
    if (!state.isDirty && state.saveStatus !== "error") return;
    void save();
  }, [save, state.isDirty, state.saveStatus]);

  const handleDelete = useCallback(() => {
    dispatch(systemDesignEditorActions.deleteSelection());
  }, []);

  const handleDuplicate = useCallback(() => {
    dispatch(systemDesignEditorActions.duplicateNodes());
  }, []);

  const handleCopy = useCallback(() => {
    dispatch(systemDesignEditorActions.copySelection());
  }, []);

  const handlePaste = useCallback(() => {
    dispatch(systemDesignEditorActions.pasteClipboard());
  }, []);

  const handleClearSelection = useCallback(() => {
    dispatch(systemDesignEditorActions.clearSelection());
  }, []);

  const handleUndo = useCallback(() => {
    dispatch(systemDesignEditorActions.undo());
  }, []);

  const handleRedo = useCallback(() => {
    dispatch(systemDesignEditorActions.redo());
  }, []);

  useSystemDesignKeyboardShortcuts({
    enabled: state.loadStatus === "ready",
    canUndo: !state.isPreviewMode && state.history.length > 0,
    canRedo: !state.isPreviewMode && state.future.length > 0,
    hasSelection: !state.isPreviewMode && selectedCount > 0,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onCopy: handleCopy,
    onPaste: handlePaste,
    onDuplicate: handleDuplicate,
    onDelete: handleDelete,
    onClearSelection: handleClearSelection,
    onSave: handleSave,
  });

  const addNode = useCallback(
    (
      type: SystemDesignNodeType,
      center: { x: number; y: number },
      arrangeAroundCenter: boolean,
    ) => {
      const index = state.document.nodes.length;
      const node = createSystemDesignNode(type, center);
      const column = index % 3;
      const row = Math.floor(index / 3) % 3;
      const x = arrangeAroundCenter
        ? center.x + (column - 1) * 210 - node.width / 2
        : center.x - node.width / 2;
      const y = arrangeAroundCenter
        ? center.y + (row - 1) * 130 - node.height / 2
        : center.y - node.height / 2;
      dispatch(
        systemDesignEditorActions.addNode({
          ...node,
          x,
          y,
        }),
      );
      setInspectorTab("properties");
    },
    [state.document.nodes.length],
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

  const handleImport = useCallback(
    async (file: File) => {
      setUiError(null);
      try {
        setPendingImport(
          await readSystemDesignImportFile(file, problem.id),
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
    [problem.id],
  );

  const handleExport = useCallback(() => {
    setUiError(null);
    try {
      downloadSystemDesignDocument(state.document, problem.slug);
    } catch (error) {
      setUiError(
        getErrorMessage(error, "The diagram could not be exported."),
      );
    }
  }, [problem.slug, state.document]);

  const togglePreview = useCallback(() => {
    const enabled = !state.isPreviewMode;
    setPreviewBriefOpen(true);
    dispatch(systemDesignEditorActions.setPreviewMode(enabled));
  }, [state.isPreviewMode]);

  const handleMarkComplete = useCallback(() => {
    if (
      state.document.nodes.length === 0 ||
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
  }, [save, state.document]);

  const handleConfirmReset = useCallback(() => {
    const at = createNextSystemDesignTimestamp(
      state.document.updatedAt,
    );
    const resetDocument: SystemDesignDocument = {
      ...state.document,
      status: "in_progress",
      nodes: [],
      edges: [],
      viewport: { ...DEFAULT_SYSTEM_DESIGN_VIEWPORT },
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
      nodes: normalizeSystemDesignLayers(pendingImport.nodes),
      updatedAt: at,
    };
    dispatch(
      systemDesignEditorActions.replaceDocument(importedDocument, at),
    );
    setPendingImport(null);
    void save(importedDocument);
  }, [pendingImport, save, state.document.updatedAt]);

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
      dispatch(systemDesignEditorActions.moveNodes(positions));
    },
    [],
  );

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

  const handleAddEdge = useCallback((edge: SystemDesignEdge) => {
    dispatch(systemDesignEditorActions.addEdge(edge));
  }, []);

  const handleViewportChange = useCallback(
    (viewport: SystemDesignViewport) => {
      dispatch(systemDesignEditorActions.setViewport(viewport));
    },
    [],
  );

  const layersProps = {
    nodes: state.document.nodes,
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
      const node = state.document.nodes.find(
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
      const node = state.document.nodes.find(
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
    <div className="hidden h-[calc(100dvh-57px)] min-h-[38rem] flex-col overflow-hidden lg:flex">
      <SystemDesignToolbar
        className="shrink-0 overflow-x-auto"
        problem={problem}
        saveState={saveState}
        isCompleted={state.document.status === "completed"}
        isPreviewMode={state.isPreviewMode}
        zoom={state.document.viewport.zoom}
        canUndo={state.history.length > 0}
        canRedo={state.future.length > 0}
        canSave={state.isDirty || state.saveStatus === "error"}
        canMarkComplete={state.document.nodes.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
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
      />

      <div className="relative flex min-h-0 flex-1">
        {!state.isPreviewMode && (
          <SystemDesignPalette onAddNode={addNodeFromPalette} />
        )}
        <div className="relative min-w-0 flex-1">
          <SystemDesignCanvas
            ref={canvasRef}
            document={state.document}
            selectedNodeIds={state.selectedNodeIds}
            selectedEdgeIds={state.selectedEdgeIds}
            preview={state.isPreviewMode}
            onSelectNode={handleSelectNode}
            onSelectEdge={handleSelectEdge}
            onClearSelection={handleClearSelection}
            onMoveNodes={handleMoveNodes}
            onResizeNode={handleResizeNode}
            onAddEdge={handleAddEdge}
            onViewportChange={handleViewportChange}
            onDropNodeType={addDroppedNode}
          />

          {state.isPreviewMode && (
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
          />
        )}
      </div>

      <SystemDesignStatusBar
        nodeCount={state.document.nodes.length}
        edgeCount={state.document.edges.length}
        selectedCount={selectedCount}
        zoom={state.document.viewport.zoom}
        saveState={saveState}
        lastSavedAt={state.lastSavedAt}
        saveError={state.saveError}
      />
    </div>
  );

  return (
    <>
      <DesktopUnavailableMessage />
      {state.loadStatus === "loading" || state.loadStatus === "idle" ? (
        <div className="hidden min-h-[calc(100vh-57px)] p-6 lg:block">
          <LoadingSkeleton rows={9} />
        </div>
      ) : state.loadStatus === "error" ? (
        <div className="hidden min-h-[calc(100vh-57px)] p-6 lg:block">
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
    </>
  );
}
