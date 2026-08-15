"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Download, Grid3X3, Group, Hand, Layers3, Link2, MousePointer2, Redo2, Save, Ungroup, Undo2, Upload } from "lucide-react";
import { DiagramCanvas } from "../canvas";
import { arrangeDiagramElements, fitViewport, positionedBounds, type DiagramArrangeCommand } from "../core/geometry";
import { createDiagramDocument, createDiagramEditorState, createDiagramShape, diagramEditorActions, diagramEditorReducer } from "../core/state";
import type { DiagramDocument, DiagramPositionedElement } from "../core/types";
import { isDiagramPositionedElement } from "../core/types";
import { downloadDiagramJson, parseDiagramDocument } from "../import-export";
import { createDefaultDiagramRegistry, systemDesignDiagramMigration } from "../packs";
import { createBrowserDiagramRepository } from "../persistence";
import { DiagramInspector } from "./DiagramInspector";
import { DiagramPalette } from "./DiagramPalette";

const STUDIO_DOCUMENT_ID = "admin-diagram-studio";

function createStudioDocument(registry: ReturnType<typeof createDefaultDiagramRegistry>): DiagramDocument {
  const document = createDiagramDocument("Architecture & Flow Studio", ["generic", "system-design", "flowchart"], STUDIO_DOCUMENT_ID);
  const page = document.pages[document.rootPageId];
  page.elements = [
    createDiagramShape(registry, "system-design.web_app", { x: 80, y: 170 }, { label: "Customer App" }),
    createDiagramShape(registry, "flowchart.decision", { x: 350, y: 160 }, { label: "Authenticated?" }),
    createDiagramShape(registry, "system-design.microservice", { x: 560, y: 165 }, { label: "Account Service" }),
    createDiagramShape(registry, "generic.note", { x: 365, y: 360 }, { label: "Mixed packs share one generic canvas." }),
  ];
  return document;
}

function editableText(element: DiagramPositionedElement): string {
  if (element.kind === "text") return element.text;
  if (element.kind === "shape" || element.kind === "frame" || element.kind === "group") return element.label ?? "";
  return element.label ?? "";
}

export function DiagramWorkspace() {
  const registry = useMemo(() => createDefaultDiagramRegistry(), []);
  const [state, dispatch] = useReducer(diagramEditorReducer, undefined, () => createDiagramEditorState(createStudioDocument(registry)));
  const [tool, setTool] = useState<"select" | "pan" | "connect">("select");
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [recentShapeIds, setRecentShapeIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<DiagramPositionedElement | null>(null);
  const [editValue, setEditValue] = useState("");
  const [status, setStatus] = useState("Loading local document…");
  const loaded = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const page = state.document.pages[state.activePageId] ?? state.document.pages[state.document.rootPageId];
  const selected = page.elements.filter((element) => state.selectedElementIds.includes(element.id));
  const selectedPositioned = selected.filter(isDiagramPositionedElement);
  const selectedElement = selected.length === 1 ? selected[0] : undefined;

  useEffect(() => {
    const repository = createBrowserDiagramRepository([systemDesignDiagramMigration]);
    if (!repository) return;
    void repository.get(STUDIO_DOCUMENT_ID).then((document) => {
      if (document) dispatch(diagramEditorActions.replaceDocument(document, true));
      loaded.current = true;
      setStatus(document ? "Loaded locally" : "New local diagram");
    }).catch((error: unknown) => { loaded.current = true; setStatus(error instanceof Error ? error.message : "Local load failed"); });
  }, []);

  useEffect(() => {
    if (!loaded.current || !state.isDirty) return;
    const timer = window.setTimeout(() => {
      const repository = createBrowserDiagramRepository([systemDesignDiagramMigration]);
      void repository?.save(state.document).then(() => { dispatch(diagramEditorActions.markSaved()); setStatus("Saved locally"); }).catch(() => setStatus("Save failed"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [state.document, state.isDirty]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "z") { event.preventDefault(); dispatch(event.shiftKey ? diagramEditorActions.redo() : diagramEditorActions.undo()); }
      else if (command && event.key.toLowerCase() === "y") { event.preventDefault(); dispatch(diagramEditorActions.redo()); }
      else if (command && event.key.toLowerCase() === "a") { event.preventDefault(); dispatch(diagramEditorActions.selectAll()); }
      else if (command && event.key.toLowerCase() === "c") { event.preventDefault(); dispatch(diagramEditorActions.copy()); }
      else if (command && event.key.toLowerCase() === "x") { event.preventDefault(); dispatch(diagramEditorActions.cut()); }
      else if (command && event.key.toLowerCase() === "v") { event.preventDefault(); dispatch(diagramEditorActions.paste()); }
      else if (command && event.key.toLowerCase() === "g") { event.preventDefault(); dispatch(event.shiftKey ? diagramEditorActions.ungroup() : diagramEditorActions.group()); }
      else if (event.key === "Delete" || event.key === "Backspace") dispatch(diagramEditorActions.deleteElements());
      else if (event.key === "Escape") { dispatch(diagramEditorActions.clearSelection()); setTool("select"); }
      else if (event.key.toLowerCase() === "v") setTool("select");
      else if (event.key.toLowerCase() === "h") setTool("pan");
      else if (event.key.toLowerCase() === "c") setTool("connect");
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

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

  const commitEdit = () => {
    if (!editing) return;
    dispatch(diagramEditorActions.updateElement(editing.id, editing.kind === "text" ? { text: editValue } : { label: editValue }));
    setEditing(null);
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

  const toolButton = (id: typeof tool, label: string, Icon: typeof MousePointer2) => <button type="button" title={`${label} · ${id === "select" ? "V" : id === "pan" ? "H" : "C"}`} onClick={() => setTool(id)} aria-label={label} aria-pressed={tool === id} className={`flex h-7 w-7 items-center justify-center rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${tool === id ? "border-accent bg-accent text-accent-foreground" : "border-transparent text-muted hover:border-border hover:bg-surface-elevated hover:text-foreground"}`}><Icon className="h-3.5 w-3.5" strokeWidth={1.9} /></button>;

  return <section className="flex h-[calc(100vh-57px)] min-h-[620px] flex-col bg-background" data-testid="diagram-workspace">
    <header className="flex min-h-12 items-center justify-between gap-2 border-b border-border bg-surface px-3">
      <div className="min-w-32"><div className="flex items-center gap-2 text-xs font-semibold"><span>Diagram Studio</span><span className="hidden rounded bg-accent/15 px-1.5 py-0.5 text-[9px] text-accent 2xl:inline">Generic engine</span></div><div className="mt-0.5 flex max-w-44 items-center gap-1 overflow-hidden text-[9px] text-muted">{breadcrumb.map((item, index) => <span key={item.id} className="flex shrink-0 items-center gap-1"><button type="button" className="max-w-28 truncate transition hover:text-accent" onClick={() => dispatch(diagramEditorActions.activatePage(item.id))}>{item.name}</button>{index < breadcrumb.length - 1 ? <span className="text-zinc-600">/</span> : null}</span>)}</div></div>
      <div className="flex items-center gap-1">
        {toolButton("select", "Select", MousePointer2)}{toolButton("pan", "Pan", Hand)}{toolButton("connect", "Connect", Link2)}
        <span className="mx-1 h-6 w-px bg-border" />
        <button type="button" title="Undo · Ctrl/Cmd Z" aria-label="Undo" disabled={!state.history.length} onClick={() => dispatch(diagramEditorActions.undo())} className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted transition hover:border-border hover:bg-surface-elevated hover:text-foreground disabled:pointer-events-none disabled:opacity-30"><Undo2 className="h-3.5 w-3.5" /></button>
        <button type="button" title="Redo · Ctrl/Cmd Shift Z" aria-label="Redo" disabled={!state.future.length} onClick={() => dispatch(diagramEditorActions.redo())} className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted transition hover:border-border hover:bg-surface-elevated hover:text-foreground disabled:pointer-events-none disabled:opacity-30"><Redo2 className="h-3.5 w-3.5" /></button>
        <button type="button" title="Group · Ctrl/Cmd G" aria-label="Group selection" disabled={selectedPositioned.length < 2} onClick={() => dispatch(diagramEditorActions.group())} className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted transition hover:border-border hover:bg-surface-elevated hover:text-foreground disabled:pointer-events-none disabled:opacity-30"><Group className="h-3.5 w-3.5" /></button>
        <button type="button" title="Ungroup · Ctrl/Cmd Shift G" aria-label="Ungroup selection" onClick={() => dispatch(diagramEditorActions.ungroup())} className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted transition hover:border-border hover:bg-surface-elevated hover:text-foreground"><Ungroup className="h-3.5 w-3.5" /></button>
        <label className="relative flex items-center"><Layers3 className="pointer-events-none absolute left-1.5 h-3 w-3 text-muted" /><select aria-label="Layer order" defaultValue="" onChange={(event) => { if (event.target.value) dispatch(diagramEditorActions.reorder(event.target.value as "forward" | "backward" | "front" | "back")); event.target.value = ""; }} className="h-7 max-w-20 rounded-md border border-border bg-background pl-5 pr-1 text-[9px] text-muted transition hover:border-zinc-500"><option value="" disabled>Layer</option><option value="forward">Forward</option><option value="backward">Backward</option><option value="front">To front</option><option value="back">To back</option></select></label>
        <select aria-label="Arrange selection" disabled={selectedPositioned.length < 2} defaultValue="" onChange={(event) => { const command = event.target.value as DiagramArrangeCommand; if (command) dispatch(diagramEditorActions.updateElements(arrangeDiagramElements(selectedPositioned, command))); event.target.value = ""; }} className="h-7 max-w-20 rounded-md border border-border bg-background px-1 text-[9px] text-muted transition hover:border-zinc-500 disabled:opacity-30">
          <option value="" disabled>Arrange</option><option value="align-left">Align left</option><option value="align-center">Align center</option><option value="align-right">Align right</option><option value="align-top">Align top</option><option value="align-middle">Align middle</option><option value="align-bottom">Align bottom</option><option value="distribute-horizontal">Distribute H</option><option value="distribute-vertical">Distribute V</option><option value="match-width">Match width</option><option value="match-height">Match height</option>
        </select>
        <button type="button" title="Toggle grid" aria-label="Toggle grid" aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)} className={`flex h-7 w-7 items-center justify-center rounded-md border transition ${showGrid ? "border-accent/40 bg-accent/10 text-accent" : "border-transparent text-muted hover:border-border hover:bg-surface-elevated"}`}><Grid3X3 className="h-3.5 w-3.5" /></button>
        <button type="button" title="Snap objects to the grid" aria-pressed={snapToGrid} onClick={() => setSnapToGrid((value) => !value)} className={`h-7 rounded-md border px-2 text-[9px] font-medium transition ${snapToGrid ? "border-accent/40 bg-accent/10 text-accent" : "border-transparent text-muted hover:border-border hover:bg-surface-elevated"}`}>Snap</button>
        <button type="button" title="Fit all objects in view" onClick={() => dispatch(diagramEditorActions.setViewport(fitViewport(positionedBounds(page.elements), 900, 650)))} className="h-7 rounded-md border border-transparent px-2 text-[9px] font-medium text-muted transition hover:border-border hover:bg-surface-elevated hover:text-foreground">Fit</button>
      </div>
      <div className="flex items-center gap-1"><span className="hidden max-w-24 truncate text-[9px] text-muted 2xl:inline">{status}</span><button type="button" title="Save locally" onClick={() => { const repository = createBrowserDiagramRepository([systemDesignDiagramMigration]); void repository?.save(state.document).then(() => { dispatch(diagramEditorActions.markSaved()); setStatus("Saved locally"); }); }} className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] font-medium transition hover:border-accent hover:bg-accent/10"><Save className="h-3 w-3" />Save</button><button type="button" title="Export diagram JSON" onClick={() => downloadDiagramJson(state.document)} className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted transition hover:border-accent hover:bg-accent/10 hover:text-foreground" aria-label="Export JSON"><Download className="h-3.5 w-3.5" /></button><button type="button" title="Import diagram JSON" onClick={() => fileInputRef.current?.click()} className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted transition hover:border-accent hover:bg-accent/10 hover:text-foreground" aria-label="Import JSON"><Upload className="h-3.5 w-3.5" /></button><input ref={fileInputRef} className="hidden" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void file.text().then((raw) => { try { dispatch(diagramEditorActions.replaceDocument(parseDiagramDocument(JSON.parse(raw), [systemDesignDiagramMigration]))); setStatus("Imported document"); } catch (error) { setStatus(error instanceof Error ? error.message : "Import failed"); } }); }} /></div>
    </header>
    <div className="flex min-h-0 flex-1"><DiagramPalette registry={registry} enabledPackIds={state.document.enabledPackIds} recentShapeIds={recentShapeIds} onAdd={addShape} /><div className="relative min-w-0 flex-1"><DiagramCanvas page={page} registry={registry} selectedElementIds={state.selectedElementIds} tool={tool} showGrid={showGrid} snapToGrid={snapToGrid} onSelect={(ids, additive) => dispatch(diagramEditorActions.select(ids, additive ? "toggle" : "replace"))} onClearSelection={() => dispatch(diagramEditorActions.clearSelection())} onMoveElements={(positions) => dispatch(diagramEditorActions.moveElements(positions))} onResizeElement={(id, size, position, rotation) => dispatch(diagramEditorActions.updateElement(id, { ...size, ...position, rotation }))} onAddConnector={(connector) => dispatch(diagramEditorActions.addConnector(connector))} onAddShape={addShape} onViewportChange={(viewport) => dispatch(diagramEditorActions.setViewport(viewport))} onOpenChildPage={(pageId) => dispatch(diagramEditorActions.activatePage(pageId))} onRequestEditLabel={(element) => { setEditing(element); setEditValue(editableText(element)); }} />{editing ? <textarea autoFocus value={editValue} onChange={(event) => setEditValue(event.target.value)} onBlur={commitEdit} onKeyDown={(event) => { if (event.key === "Escape") setEditing(null); if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) commitEdit(); }} className="absolute left-1/2 top-16 z-20 h-28 w-80 -translate-x-1/2 rounded-lg border-2 border-accent bg-surface p-3 text-sm shadow-2xl outline-none" aria-label="Edit element text" /> : null}<div className="pointer-events-none absolute bottom-3 left-3 rounded bg-surface/90 px-2 py-1 text-[10px] text-muted">{page.elements.filter(isDiagramPositionedElement).length} objects · {page.elements.filter((element) => element.kind === "connector").length} connectors · {Math.round(page.viewport.zoom * 100)}%</div></div><DiagramInspector element={selectedElement} registry={registry} onPatch={(changes) => { if (selectedElement) dispatch(diagramEditorActions.updateElement(selectedElement.id, changes)); }} onCreateChildPage={() => selectedElement && dispatch(diagramEditorActions.createChildPage(selectedElement.id))} onOpenChildPage={(pageId) => dispatch(diagramEditorActions.activatePage(pageId))} /></div>
  </section>;
}
