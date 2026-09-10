"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Grid3X3,
  LocateFixed,
  Magnet,
  Maximize2,
  Settings2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  EditorIconButton,
  editorGhostButtonClass,
} from "./SystemDesignUiPrimitives";

export function SystemDesignViewportControls({
  zoom,
  showGrid,
  snapToGrid,
  snapToObjects,
  onZoomOut,
  onZoomIn,
  onFitToScreen,
  onResetViewport,
  onToggleGrid,
  onToggleSnapToGrid,
  onToggleSnapToObjects,
}: {
  zoom: number;
  showGrid: boolean;
  snapToGrid: boolean;
  snapToObjects: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFitToScreen: () => void;
  onResetViewport: () => void;
  onToggleGrid: () => void;
  onToggleSnapToGrid: () => void;
  onToggleSnapToObjects: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const setting = (
    label: string,
    active: boolean,
    Icon: typeof Grid3X3,
    onClick: () => void,
  ) => (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={active}
      className={`${editorGhostButtonClass} w-full justify-start px-2`}
      onClick={onClick}
    >
      <Icon className={active ? "h-4 w-4 text-accent" : "h-4 w-4"} aria-hidden="true" />
      <span className="flex-1 text-left">{label}</span>
      {active && <Check className="h-3.5 w-3.5 text-accent" aria-hidden="true" />}
    </button>
  );

  return (
    <div ref={root} className="absolute bottom-3 right-3 z-20">
      {open && (
        <div
          role="menu"
          aria-label="Viewport settings"
          className="absolute bottom-11 right-0 w-48 rounded-lg border border-[var(--editor-border)] bg-[var(--editor-floating)] p-1.5 shadow-xl backdrop-blur"
        >
          <button
            type="button"
            role="menuitem"
            className={`${editorGhostButtonClass} w-full justify-start px-2`}
            onClick={() => {
              onResetViewport();
              setOpen(false);
            }}
          >
            <LocateFixed className="h-4 w-4" aria-hidden="true" />
            Reset viewport
          </button>
          <div className="my-1 h-px bg-[var(--editor-border)]" role="separator" />
          {setting("Show grid", showGrid, Grid3X3, onToggleGrid)}
          {setting("Snap to grid", snapToGrid, Magnet, onToggleSnapToGrid)}
          {setting("Snap to objects", snapToObjects, LocateFixed, onToggleSnapToObjects)}
        </div>
      )}
      <div
        className="flex items-center rounded-lg border border-[var(--editor-border)] bg-[var(--editor-floating)] p-1 shadow-lg backdrop-blur"
        role="toolbar"
        aria-label="Viewport controls"
      >
        <EditorIconButton label="Zoom out" disabled={zoom <= 0.25} onClick={onZoomOut}>
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </EditorIconButton>
        <output
          className="w-12 text-center text-[11px] font-medium tabular-nums text-foreground"
          aria-label={`Current zoom ${Math.round(zoom * 100)} percent`}
        >
          {Math.round(zoom * 100)}%
        </output>
        <EditorIconButton label="Zoom in" disabled={zoom >= 2} onClick={onZoomIn}>
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </EditorIconButton>
        <div className="mx-1 h-5 w-px bg-[var(--editor-border)]" aria-hidden="true" />
        <EditorIconButton label="Fit diagram to screen" onClick={onFitToScreen}>
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
        </EditorIconButton>
        <EditorIconButton
          label="Viewport settings"
          active={open}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Settings2 className="h-4 w-4" aria-hidden="true" />
        </EditorIconButton>
      </div>
    </div>
  );
}
