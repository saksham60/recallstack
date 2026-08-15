"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { BringToFront, ClipboardPaste, Copy, Download, EyeOff, Frame, Grid3X3, Group, Hand, ImagePlus, Layers3, Link2, ListTree, Lock, MousePointer2, PanelRightClose, PanelRightOpen, Redo2, Save, Scissors, SendToBack, Trash2, Type, Ungroup, Undo2, Upload } from "lucide-react";
import { DiagramCanvas } from "../canvas";
import { arrangeDiagramElements, fitViewport, positionedBounds, type DiagramArrangeCommand } from "../core/geometry";
import { createDiagramDocument, createDiagramEditorState, createDiagramFrame, createDiagramId, createDiagramImage, createDiagramShape, createDiagramText, diagramEditorActions, diagramEditorReducer } from "../core/state";
import type { DiagramConnectorElement, DiagramDocument, DiagramEditorTool, DiagramPoint, DiagramPositionedElement } from "../core/types";
import { isDiagramPositionedElement } from "../core/types";
import { downloadDiagramJson, downloadDiagramPdf, downloadDiagramPng, downloadDiagramSvg, downloadDrawioXml, parseDiagramDocument, parseDrawioXml, readDiagramImageFile } from "../import-export";
import { createDefaultDiagramRegistry, systemDesignDiagramMigration } from "../packs";
import { createBrowserDiagramRepository } from "../persistence/BrowserDiagramRepository";
import { DiagramInspector } from "./DiagramInspector";
import { DiagramLayersPanel } from "./DiagramLayersPanel";
import { DiagramContextMenu, type DiagramContextMenuItem } from "./DiagramContextMenu";
import { DiagramExportMenu, type DiagramExportFormat, type DiagramExportPreferences } from "./DiagramExportMenu";
import { DiagramPageBar } from "./DiagramPageBar";
import { DiagramPalette } from "./DiagramPalette";

function createStudioDocument(documentId: string): DiagramDocument {
  return createDiagramDocument("Untitled Diagram", ["generic", "system-design", "flowchart", "erd", "cloud"], documentId);
}

function editableText(element: DiagramPositionedElement): string {
  if (element.kind === "text") return element.text;
  if (element.kind === "shape" || element.kind === "frame" || element.kind === "group") return element.label ?? "";
  return element.label ?? "";
}

export function DiagramWorkspace({ documentId }: { documentId: string }) {
  const registry = useMemo(() => createDefaultDiagramRegistry(), []);
  const repository = useMemo(() => createBrowserDiagramRepository([systemDesignDiagramMigration]), []);
  const [state, dispatch] = useReducer(diagramEditorReducer, undefined, () => createDiagramEditorState(createStudioDocument(documentId)));
  const [tool, setTool] = useState<DiagramEditorTool>("select");
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [recentShapeIds, setRecentShapeIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<DiagramPositionedElement | null>(null);
  const [editingConnector, setEditingConnector] = useState<{ connector: DiagramConnectorElement; point: DiagramPoint } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [status, setStatus] = useState("Loading diagram…");
  const [rightPanel, setRightPanel] = useState<"properties" | "layers">("properties");
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; point: DiagramPoint; elementId?: string } | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const loaded = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const page = state.document.pages[state.activePageId] ?? state.document.pages[state.document.rootPageId];
  const selected = page.elements.filter((element) => state.selectedElementIds.includes(element.id));
  const selectedPositioned = selected.filter(isDiagramPositionedElement);
  const selectedElement = selected.length === 1 ? selected[0] : undefined;

  useEffect(() => {
    if (!repository) return;
    void repository.get(documentId).then((document) => {
      if (document) dispatch(diagramEditorActions.replaceDocument(document, true));
      else void repository.save(createStudioDocument(documentId));
      loaded.current = true;
      setStatus(document ? "Loaded draft" : "Created diagram");
    }).catch((error: unknown) => { loaded.current = true; setStatus(error instanceof Error ? error.message : "Local load failed"); });
  }, [documentId, repository]);

  useEffect(() => {
    if (!loaded.current || !state.isDirty) return;
    const timer = window.setTimeout(() => {
      void repository?.save(state.document).then((saved) => { dispatch(diagramEditorActions.markSaved(saved)); setStatus(repository.lastSaveMode === "api" ? "Saved" : "Saved as local recovery draft"); }).catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Save failed"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [repository, state.document, state.isDirty]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "z") { event.preventDefault(); dispatch(event.shiftKey ? diagramEditorActions.redo() : diagramEditorActions.undo()); }
      else if (command && event.key.toLowerCase() === "y") { event.preventDefault(); dispatch(diagramEditorActions.redo()); }
      else if (command && event.key === "0") { event.preventDefault(); dispatch(diagramEditorActions.setViewport({ ...page.viewport, zoom: 1 })); }
      else if (command && (event.key === "+" || event.key === "=")) { event.preventDefault(); dispatch(diagramEditorActions.setViewport({ ...page.viewport, zoom: Math.min(3, page.viewport.zoom * 1.2) })); }
      else if (command && event.key === "-") { event.preventDefault(); dispatch(diagramEditorActions.setViewport({ ...page.viewport, zoom: Math.max(0.1, page.viewport.zoom / 1.2) })); }
      else if (event.shiftKey && event.key === "1") { event.preventDefault(); dispatch(diagramEditorActions.setViewport(fitViewport(positionedBounds(page.elements), 900, 650))); }
      else if (event.shiftKey && event.key === "2" && selectedPositioned.length) { event.preventDefault(); dispatch(diagramEditorActions.setViewport(fitViewport(positionedBounds(selectedPositioned), 900, 650))); }
      else if (command && event.key.toLowerCase() === "a") { event.preventDefault(); dispatch(diagramEditorActions.selectAll()); }
      else if (command && event.key.toLowerCase() === "c") { event.preventDefault(); dispatch(diagramEditorActions.copy()); }
      else if (command && event.key.toLowerCase() === "x") { event.preventDefault(); dispatch(diagramEditorActions.cut()); }
      else if (command && event.key.toLowerCase() === "d") { event.preventDefault(); dispatch(diagramEditorActions.copy()); dispatch(diagramEditorActions.paste()); }
      else if (command && event.key.toLowerCase() === "g") { event.preventDefault(); dispatch(event.shiftKey ? diagramEditorActions.ungroup() : diagramEditorActions.group()); }
      else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && selectedPositioned.length) {
        event.preventDefault();
        const distance = event.shiftKey ? 10 : 1;
        const delta = event.key === "ArrowLeft" ? { x: -distance, y: 0 } : event.key === "ArrowRight" ? { x: distance, y: 0 } : event.key === "ArrowUp" ? { x: 0, y: -distance } : { x: 0, y: distance };
        dispatch(diagramEditorActions.moveElements(Object.fromEntries(selectedPositioned.filter((element) => !element.locked).map((element) => [element.id, { x: element.x + delta.x, y: element.y + delta.y }]))));
      }
      else if (event.key === "Delete" || event.key === "Backspace") dispatch(diagramEditorActions.deleteElements());
      else if (event.key === "Escape") { dispatch(diagramEditorActions.clearSelection()); setTool("select"); }
      else if (event.key.toLowerCase() === "v") setTool("select");
      else if (event.key.toLowerCase() === "h") setTool("pan");
      else if (event.key.toLowerCase() === "c") setTool("connect");
      else if (event.key.toLowerCase() === "t") setTool("text");
      else if (event.key.toLowerCase() === "f") setTool("frame");
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [page.elements, page.viewport, selectedPositioned]);

  const addShape = useCallback((shapeDefinitionId: string, point?: { x: number; y: number }) => {
    const viewport = page.viewport;
    const definition = registry.requireShape(shapeDefinitionId);
    const base = point ?? { x: (425 - viewport.x) / viewport.zoom - definition.defaultSize.width / 2, y: (300 - viewport.y) / viewport.zoom - definition.defaultSize.height / 2 };
    const existing = page.elements.filter(isDiagramPositionedElement).filter((element) => element.visible);
    const collides = (candidate: { x: number; y: number }) => existing.some((element) => candidate.x < element.x + element.width + 16 && candidate.x + definition.defaultSize.width + 16 > element.x && candidate.y < element.y + element.height + 16 && candidate.y + definition.defaultSize.height + 16 > element.y);
    let position = base;
    if (!point && collides(position)) {
      const step = 40;
      outer: for (let radius = 1; radius <= 8; radius += 1) {
        for (let y = -radius; y <= radius; y += 1) {
          for (let x = -radius; x <= radius; x += 1) {
            if (Math.abs(x) !== radius && Math.abs(y) !== radius) continue;
            const candidate = { x: base.x + x * step, y: base.y + y * step };
            if (!collides(candidate)) { position = candidate; break outer; }
          }
        }
      }
    }
    dispatch(diagramEditorActions.addElement(createDiagramShape(registry, shapeDefinitionId, position)));
    setRecentShapeIds((ids) => [shapeDefinitionId, ...ids.filter((id) => id !== shapeDefinitionId)].slice(0, 6));
  }, [page.elements, page.viewport, registry]);

  const addText = useCallback((point: DiagramPoint) => {
    const element = createDiagramText(point, "Text");
    dispatch(diagramEditorActions.addElement(element));
    dispatch(diagramEditorActions.select([element.id]));
    setEditingConnector(null);
    setEditValue(element.text);
    setTool("select");
    window.setTimeout(() => setEditing(element), 0);
  }, []);

  const addFrame = useCallback((point: DiagramPoint) => {
    const element = createDiagramFrame(point);
    dispatch(diagramEditorActions.addElement(element));
    dispatch(diagramEditorActions.select([element.id]));
    setTool("select");
  }, []);

  const addImageFiles = useCallback(async (files: readonly File[], point?: DiagramPoint) => {
    const base = point ?? { x: (425 - page.viewport.x) / page.viewport.zoom - 160, y: (300 - page.viewport.y) / page.viewport.zoom - 100 };
    let added = 0;
    try {
      for (const file of files) {
        if (!file.type.startsWith("image/") && !file.name.toLowerCase().endsWith(".svg")) continue;
        const asset = await readDiagramImageFile(file);
        const element = createDiagramImage({ x: base.x + added * 24, y: base.y + added * 24 }, asset);
        dispatch(diagramEditorActions.addElement(element));
        dispatch(diagramEditorActions.select([element.id]));
        added += 1;
      }
      setStatus(added ? `Added ${added} image${added === 1 ? "" : "s"}` : "No supported images found");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Image import failed");
    }
  }, [page.viewport]);

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
      const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith("image/"));
      event.preventDefault();
      if (files.length) void addImageFiles(files);
      else dispatch(diagramEditorActions.paste());
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [addImageFiles]);

  const commitEdit = () => {
    if (editing) {
      dispatch(diagramEditorActions.updateElement(editing.id, editing.kind === "text" ? { text: editValue } : { label: editValue }));
    } else if (editingConnector) {
      const labels = editingConnector.connector.labels.length
        ? editingConnector.connector.labels.map((label, index) => index === 0 ? { ...label, text: editValue } : label)
        : [{ id: createDiagramId("label"), text: editValue, position: 0.5 }];
      dispatch(diagramEditorActions.updateConnector(editingConnector.connector.id, { labels }));
    } else return;
    setEditing(null);
    setEditingConnector(null);
  };

  const breadcrumb = useMemo(() => {
    const chain = [];
    let current = page;
    while (current) {
      chain.unshift(current);
      if (!current.parentElementId) break;
      const parent = Object.values(state.document.pages).find((candidate) => candidate.elements.some((element) => element.id === current.parentElementId));
      if (!parent) break;
      current = parent;
    }
    return chain;
  }, [page, state.document.pages]);

  const toolButton = (id: typeof tool, label: string, Icon: typeof MousePointer2) => {
    const shortcut = { select: "V", pan: "H", connect: "C", text: "T", frame: "F" }[id];
    return <button type="button" title={`${label} · ${shortcut}`} onClick={() => setTool(id)} aria-label={label} aria-pressed={tool === id} className={`flex h-7 w-7 items-center justify-center rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${tool === id ? "border-accent bg-accent text-accent-foreground" : "border-transparent text-muted hover:border-border hover:bg-surface-elevated hover:text-foreground"}`}><Icon className="h-3.5 w-3.5" strokeWidth={1.9} /></button>;
  };

  const contextElement = contextMenu?.elementId ? page.elements.find((element) => element.id === contextMenu.elementId) : undefined;
  const contextItems: DiagramContextMenuItem[] = !contextMenu ? [] : contextElement ? [
    { id: "cut", label: "Cut", shortcut: "Ctrl/Cmd X", icon: Scissors, onSelect: () => dispatch(diagramEditorActions.cut()) },
    { id: "copy", label: "Copy", shortcut: "Ctrl/Cmd C", icon: Copy, onSelect: () => dispatch(diagramEditorActions.copy()) },
    { id: "duplicate", label: "Duplicate", shortcut: "Ctrl/Cmd D", icon: Copy, onSelect: () => { dispatch(diagramEditorActions.copy()); dispatch(diagramEditorActions.paste()); } },
    { id: "delete", label: "Delete", shortcut: "Del", icon: Trash2, danger: true, onSelect: () => dispatch(diagramEditorActions.deleteElements()) },
    { id: "group", label: contextElement.kind === "group" ? "Ungroup" : "Group selection", shortcut: "Ctrl/Cmd G", icon: contextElement.kind === "group" ? Ungroup : Group, separatorBefore: true, disabled: contextElement.kind !== "group" && selectedPositioned.length < 2, onSelect: () => dispatch(contextElement.kind === "group" ? diagramEditorActions.ungroup() : diagramEditorActions.group()) },
    { id: "forward", label: "Bring forward", icon: BringToFront, onSelect: () => dispatch(diagramEditorActions.reorder("forward")) },
    { id: "backward", label: "Send backward", icon: SendToBack, onSelect: () => dispatch(diagramEditorActions.reorder("backward")) },
    { id: "front", label: "Bring to front", onSelect: () => dispatch(diagramEditorActions.reorder("front")) },
    { id: "back", label: "Send to back", onSelect: () => dispatch(diagramEditorActions.reorder("back")) },
    { id: "lock", label: contextElement.locked ? "Unlock" : "Lock", icon: Lock, separatorBefore: true, onSelect: () => dispatch(diagramEditorActions.updateElement(contextElement.id, { locked: !contextElement.locked })) },
    { id: "hide", label: "Hide", icon: EyeOff, onSelect: () => dispatch(diagramEditorActions.updateElement(contextElement.id, { visible: false })) },
    ...(contextElement.kind === "connector" ? [
      { id: "label", label: "Add or edit label", onSelect: () => { setEditing(null); setEditingConnector({ connector: contextElement, point: contextMenu.point }); setEditValue(contextElement.labels[0]?.text ?? ""); } },
      { id: "straight", label: "Straight routing", onSelect: () => dispatch(diagramEditorActions.updateConnector(contextElement.id, { routing: "straight" })) },
      { id: "orthogonal", label: "Orthogonal routing", onSelect: () => dispatch(diagramEditorActions.updateConnector(contextElement.id, { routing: "orthogonal" })) },
      { id: "dashed", label: "Toggle dashed line", onSelect: () => dispatch(diagramEditorActions.updateConnector(contextElement.id, { connectorStyle: { ...contextElement.style, strokeStyle: contextElement.style?.strokeStyle === "dashed" ? "solid" : "dashed" } })) },
      { id: "arrow", label: "Toggle end arrow", onSelect: () => dispatch(diagramEditorActions.updateConnector(contextElement.id, { connectorStyle: { ...contextElement.style, endArrowhead: contextElement.style?.endArrowhead === "none" ? "standard" : "none" } })) },
    ] satisfies DiagramContextMenuItem[] : []),
    ...((contextElement.kind === "shape" || contextElement.kind === "frame") ? [{ id: "child", label: contextElement.childPageId ? "Open child page" : "Create child page", separatorBefore: true, onSelect: () => contextElement.childPageId ? dispatch(diagramEditorActions.activatePage(contextElement.childPageId)) : dispatch(diagramEditorActions.createChildPage(contextElement.id)) }] satisfies DiagramContextMenuItem[] : []),
  ] : [
    { id: "paste", label: "Paste", shortcut: "Ctrl/Cmd V", icon: ClipboardPaste, onSelect: () => dispatch(diagramEditorActions.paste()) },
    { id: "select-all", label: "Select all", shortcut: "Ctrl/Cmd A", icon: MousePointer2, onSelect: () => dispatch(diagramEditorActions.selectAll()) },
    { id: "add-text", label: "Add text", shortcut: "T", icon: Type, separatorBefore: true, onSelect: () => addText(contextMenu.point) },
    { id: "add-frame", label: "Add frame", shortcut: "F", icon: Frame, onSelect: () => addFrame(contextMenu.point) },
    { id: "fit", label: "Fit diagram", shortcut: "Shift 1", onSelect: () => dispatch(diagramEditorActions.setViewport(fitViewport(positionedBounds(page.elements), 900, 650))) },
    { id: "reset", label: "Reset zoom", shortcut: "Ctrl/Cmd 0", onSelect: () => dispatch(diagramEditorActions.setViewport({ ...page.viewport, zoom: 1 })) },
  ];

  const exportDiagram = (format: DiagramExportFormat, preferences: DiagramExportPreferences) => {
    const options = { background: preferences.transparent ? null : "#09090b", elementIds: preferences.selectionOnly ? state.selectedElementIds : undefined };
    try {
      if (format === "json") downloadDiagramJson(state.document);
      else if (format === "svg") downloadDiagramSvg(state.document, page, registry, options);
      else if (format === "drawio") downloadDrawioXml(state.document, page);
      else if (format === "png") void downloadDiagramPng(state.document, page, registry, { ...options, scale: preferences.scale }).then(() => setStatus("PNG exported")).catch((error: unknown) => setStatus(error instanceof Error ? error.message : "PNG export failed"));
      else void downloadDiagramPdf(state.document, page, registry, options).then(() => setStatus("PDF exported")).catch((error: unknown) => setStatus(error instanceof Error ? error.message : "PDF export failed"));
      if (format === "svg" || format === "json" || format === "drawio") setStatus(`${format.toUpperCase()} exported`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Export failed"); }
  };

  return <section className="flex h-[calc(100vh-57px)] min-h-[620px] flex-col bg-background" data-testid="diagram-workspace">
    <header className="flex min-h-12 items-center justify-between gap-2 border-b border-border bg-surface px-3">
      <div className="flex min-w-32 items-center gap-2"><Link href="/admin/diagrams" aria-label="Back to diagram library" title="Back to diagram library" className="rounded px-1.5 py-1 text-muted transition hover:bg-surface-elevated hover:text-foreground">‹</Link><div><div className="flex items-center gap-2 text-xs font-semibold"><span className="max-w-44 truncate">{state.document.title}</span><span className="hidden rounded bg-accent/15 px-1.5 py-0.5 text-[9px] text-accent 2xl:inline">Diagram Studio</span></div><div className="mt-0.5 flex max-w-44 items-center gap-1 overflow-hidden text-[9px] text-muted">{breadcrumb.map((item, index) => <span key={item.id} className="flex shrink-0 items-center gap-1"><button type="button" className="max-w-28 truncate transition hover:text-accent" onClick={() => dispatch(diagramEditorActions.activatePage(item.id))}>{item.name}</button>{index < breadcrumb.length - 1 ? <span className="text-zinc-600">/</span> : null}</span>)}</div></div></div>
      <div className="flex items-center gap-1">
        {toolButton("select", "Select", MousePointer2)}{toolButton("pan", "Pan", Hand)}{toolButton("connect", "Connect", Link2)}{toolButton("text", "Text", Type)}{toolButton("frame", "Frame", Frame)}
        <button type="button" title="Import image" aria-label="Import image" onClick={() => imageInputRef.current?.click()} className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted transition hover:border-border hover:bg-surface-elevated hover:text-foreground"><ImagePlus className="h-3.5 w-3.5" /></button>
        <input ref={imageInputRef} className="hidden" type="file" multiple accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" onChange={(event) => { if (event.target.files?.length) void addImageFiles([...event.target.files]); event.target.value = ""; }} />
        <span className="mx-1 h-6 w-px bg-border" />
        <button type="button" title="Undo · Ctrl/Cmd Z" aria-label="Undo" disabled={!state.history.length} onClick={() => dispatch(diagramEditorActions.undo())} className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted transition hover:border-border hover:bg-surface-elevated hover:text-foreground disabled:pointer-events-none disabled:opacity-30"><Undo2 className="h-3.5 w-3.5" /></button>
        <button type="button" title="Redo · Ctrl/Cmd Shift Z" aria-label="Redo" disabled={!state.future.length} onClick={() => dispatch(diagramEditorActions.redo())} className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted transition hover:border-border hover:bg-surface-elevated hover:text-foreground disabled:pointer-events-none disabled:opacity-30"><Redo2 className="h-3.5 w-3.5" /></button>
        <button type="button" title="Group · Ctrl/Cmd G" aria-label="Group selection" disabled={selectedPositioned.length < 2} onClick={() => dispatch(diagramEditorActions.group())} className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted transition hover:border-border hover:bg-surface-elevated hover:text-foreground disabled:pointer-events-none disabled:opacity-30"><Group className="h-3.5 w-3.5" /></button>
        <button type="button" title="Ungroup · Ctrl/Cmd Shift G" aria-label="Ungroup selection" onClick={() => dispatch(diagramEditorActions.ungroup())} className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted transition hover:border-border hover:bg-surface-elevated hover:text-foreground"><Ungroup className="h-3.5 w-3.5" /></button>
        <button type="button" title="Open layers panel" aria-label="Open layers panel" onClick={() => { setRightPanel("layers"); setRightPanelOpen(true); }} className={`flex h-7 w-7 items-center justify-center rounded-md border transition ${rightPanelOpen && rightPanel === "layers" ? "border-accent/40 bg-accent/10 text-accent" : "border-transparent text-muted hover:border-border hover:bg-surface-elevated"}`}><Layers3 className="h-3.5 w-3.5" /></button>
        <select aria-label="Arrange selection" disabled={selectedPositioned.length < 2} defaultValue="" onChange={(event) => { const command = event.target.value as DiagramArrangeCommand; if (command) dispatch(diagramEditorActions.updateElements(arrangeDiagramElements(selectedPositioned, command))); event.target.value = ""; }} className="h-7 max-w-20 rounded-md border border-border bg-background px-1 text-[9px] text-muted transition hover:border-zinc-500 disabled:opacity-30">
          <option value="" disabled>Arrange</option><option value="align-left">Align left</option><option value="align-center">Align center</option><option value="align-right">Align right</option><option value="align-top">Align top</option><option value="align-middle">Align middle</option><option value="align-bottom">Align bottom</option><option value="distribute-horizontal">Distribute H</option><option value="distribute-vertical">Distribute V</option><option value="match-width">Match width</option><option value="match-height">Match height</option>
        </select>
        <button type="button" title="Toggle grid" aria-label="Toggle grid" aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)} className={`flex h-7 w-7 items-center justify-center rounded-md border transition ${showGrid ? "border-accent/40 bg-accent/10 text-accent" : "border-transparent text-muted hover:border-border hover:bg-surface-elevated"}`}><Grid3X3 className="h-3.5 w-3.5" /></button>
        <button type="button" title="Snap objects to the grid" aria-pressed={snapToGrid} onClick={() => setSnapToGrid((value) => !value)} className={`h-7 rounded-md border px-2 text-[9px] font-medium transition ${snapToGrid ? "border-accent/40 bg-accent/10 text-accent" : "border-transparent text-muted hover:border-border hover:bg-surface-elevated"}`}>Snap</button>
        <button type="button" title="Fit all objects in view" onClick={() => dispatch(diagramEditorActions.setViewport(fitViewport(positionedBounds(page.elements), 900, 650)))} className="h-7 rounded-md border border-transparent px-2 text-[9px] font-medium text-muted transition hover:border-border hover:bg-surface-elevated hover:text-foreground">Fit</button>
      </div>
      <div className="flex items-center gap-1">
        <span className="hidden max-w-48 truncate text-[9px] text-muted 2xl:inline" role="status">{status}</span>
        <button type="button" title="Save diagram" onClick={() => { void repository?.save(state.document).then((saved) => { dispatch(diagramEditorActions.markSaved(saved)); setStatus(repository.lastSaveMode === "api" ? "Saved" : "Saved as local recovery draft"); }).catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Save failed")); }} className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] font-medium transition hover:border-accent hover:bg-accent/10"><Save className="h-3 w-3" />Save</button>
        <div className="relative"><button type="button" title="Export diagram" onClick={() => setShowExportMenu((value) => !value)} className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted transition hover:border-accent hover:bg-accent/10 hover:text-foreground" aria-label="Export diagram" aria-expanded={showExportMenu}><Download className="h-3.5 w-3.5" /></button>{showExportMenu ? <DiagramExportMenu hasSelection={Boolean(state.selectedElementIds.length)} onExport={exportDiagram} onClose={() => setShowExportMenu(false)} /> : null}</div>
        <button type="button" title="Import diagram JSON" onClick={() => fileInputRef.current?.click()} className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted transition hover:border-accent hover:bg-accent/10 hover:text-foreground" aria-label="Import JSON"><Upload className="h-3.5 w-3.5" /></button>
        <input ref={fileInputRef} className="hidden" type="file" accept="application/json,.json,.drawio,.xml,application/xml" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void file.text().then((raw) => { try { const imported = file.name.toLowerCase().endsWith(".drawio") || file.name.toLowerCase().endsWith(".xml") ? parseDrawioXml(raw, registry, file.name.replace(/\.(?:drawio|xml)$/i, "")) : parseDiagramDocument(JSON.parse(raw), [systemDesignDiagramMigration]); dispatch(diagramEditorActions.replaceDocument(imported)); setStatus("Imported document"); } catch (error) { setStatus(error instanceof Error ? error.message : "Import failed"); } finally { event.target.value = ""; } }); }} />
        <button type="button" title={rightPanelOpen ? "Close side panel" : "Open side panel"} aria-label={rightPanelOpen ? "Close side panel" : "Open side panel"} onClick={() => setRightPanelOpen((value) => !value)} className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted transition hover:border-border hover:bg-surface-elevated hover:text-foreground">{rightPanelOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}</button>
      </div>
    </header>
    <div className="flex min-h-0 flex-1">
      <DiagramPalette registry={registry} enabledPackIds={state.document.enabledPackIds} recentShapeIds={recentShapeIds} onAdd={addShape} />
      <div className="flex min-w-0 flex-1 flex-col">
       <div className="relative min-h-0 flex-1">
        <DiagramCanvas
          page={page}
          registry={registry}
          selectedElementIds={state.selectedElementIds}
          tool={tool}
          showGrid={showGrid}
          snapToGrid={snapToGrid}
          onSelect={(ids, additive) => dispatch(diagramEditorActions.select(ids, additive ? "toggle" : "replace"))}
          onClearSelection={() => dispatch(diagramEditorActions.clearSelection())}
          onMoveElements={(positions) => dispatch(diagramEditorActions.moveElements(positions))}
          onTransformElements={(transforms) => dispatch(diagramEditorActions.transformElements(transforms))}
          onAddConnector={(connector) => dispatch(diagramEditorActions.addConnector(connector))}
          onUpdateConnector={(connectorId, changes) => dispatch(diagramEditorActions.updateConnector(connectorId, changes))}
          onAddShape={addShape}
          onCanvasTool={(activeTool, point) => activeTool === "text" ? addText(point) : addFrame(point)}
          onDropImageFiles={(files, point) => { void addImageFiles(files, point); }}
          onRequestContextMenu={(elementId, clientPoint, point) => {
            if (elementId && !state.selectedElementIds.includes(elementId)) dispatch(diagramEditorActions.select([elementId]));
            setContextMenu({ x: clientPoint.x, y: clientPoint.y, point, ...(elementId ? { elementId } : {}) });
          }}
          onViewportChange={(viewport) => dispatch(diagramEditorActions.setViewport(viewport))}
          onOpenChildPage={(pageId) => dispatch(diagramEditorActions.activatePage(pageId))}
          onRequestEditLabel={(element) => { setEditingConnector(null); setEditing(element); setEditValue(editableText(element)); }}
          onRequestEditConnectorLabel={(connector, point) => { setEditing(null); setEditingConnector({ connector, point }); setEditValue(connector.labels[0]?.text ?? ""); }}
        />
        {editing || editingConnector ? <textarea autoFocus value={editValue} onChange={(event) => setEditValue(event.target.value)} onBlur={commitEdit} onKeyDown={(event) => { if (event.key === "Escape") { setEditing(null); setEditingConnector(null); } if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) commitEdit(); }} style={editingConnector ? { left: page.viewport.x + editingConnector.point.x * page.viewport.zoom, top: page.viewport.y + editingConnector.point.y * page.viewport.zoom } : editing ? { left: page.viewport.x + editing.x * page.viewport.zoom, top: page.viewport.y + editing.y * page.viewport.zoom, width: Math.max(160, editing.width * page.viewport.zoom), height: Math.max(48, editing.height * page.viewport.zoom) } : undefined} className={`absolute z-20 resize-none rounded-md border-2 border-accent bg-surface px-2 py-1 text-xs shadow-2xl outline-none ${editingConnector ? "h-10 w-44 -translate-x-1/2 -translate-y-1/2" : ""}`} aria-label={editingConnector ? "Edit connector label" : "Edit element text"} /> : null}
        <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-surface/90 px-2 py-1 text-[10px] text-muted">{page.elements.filter(isDiagramPositionedElement).length} objects · {page.elements.filter((element) => element.kind === "connector").length} connectors · {Math.round(page.viewport.zoom * 100)}%</div>
       </div>
       <DiagramPageBar
         document={state.document}
         activePageId={breadcrumb[0]?.id ?? state.document.rootPageId}
         onActivate={(pageId) => dispatch(diagramEditorActions.activatePage(pageId))}
         onAdd={() => dispatch(diagramEditorActions.addPage())}
         onRename={(pageId, name) => dispatch(diagramEditorActions.renamePage(pageId, name))}
         onDuplicate={(pageId) => dispatch(diagramEditorActions.duplicatePage(pageId))}
         onDelete={(pageId) => dispatch(diagramEditorActions.deletePage(pageId))}
         onReorder={(pageId, toIndex) => dispatch(diagramEditorActions.reorderPage(pageId, toIndex))}
       />
      </div>
      {rightPanelOpen ? <aside className="flex h-full w-[248px] shrink-0 flex-col border-l border-border bg-surface/80" aria-label="Editor side panel">
       <div className="flex h-9 shrink-0 border-b border-border p-1" role="tablist" aria-label="Side panel">
        <button type="button" role="tab" aria-selected={rightPanel === "properties"} onClick={() => setRightPanel("properties")} className={`flex flex-1 items-center justify-center gap-1 rounded text-[10px] font-medium transition ${rightPanel === "properties" ? "bg-surface-elevated text-foreground" : "text-muted hover:text-foreground"}`}><ListTree className="h-3 w-3" />Properties</button>
        <button type="button" role="tab" aria-selected={rightPanel === "layers"} onClick={() => setRightPanel("layers")} className={`flex flex-1 items-center justify-center gap-1 rounded text-[10px] font-medium transition ${rightPanel === "layers" ? "bg-surface-elevated text-foreground" : "text-muted hover:text-foreground"}`}><Layers3 className="h-3 w-3" />Layers</button>
       </div>
       <div className="min-h-0 flex-1">{rightPanel === "properties" ? <DiagramInspector
        elements={selected}
        registry={registry}
        onPatch={(elementId, changes) => dispatch(diagramEditorActions.updateElement(elementId, changes))}
        onPatchMany={(patches) => dispatch(diagramEditorActions.updateElements(patches))}
        onArrange={(command) => dispatch(diagramEditorActions.updateElements(arrangeDiagramElements(selectedPositioned, command)))}
        onCreateChildPage={() => selectedElement && dispatch(diagramEditorActions.createChildPage(selectedElement.id))}
        onOpenChildPage={(pageId) => dispatch(diagramEditorActions.activatePage(pageId))}
       /> : <DiagramLayersPanel elements={page.elements} selectedElementIds={state.selectedElementIds} registry={registry} onSelect={(elementId, additive) => dispatch(diagramEditorActions.select([elementId], additive ? "toggle" : "replace"))} onPatch={(elementId, patch) => dispatch(diagramEditorActions.updateElement(elementId, patch))} onSetOrder={(ids) => dispatch(diagramEditorActions.updateElements(Object.fromEntries(ids.map((id, layer) => [id, { layer }]))))} />}</div>
      </aside> : null}
    </div>
    {contextMenu ? <DiagramContextMenu x={contextMenu.x} y={contextMenu.y} items={contextItems} onClose={() => setContextMenu(null)} /> : null}
  </section>;
}
