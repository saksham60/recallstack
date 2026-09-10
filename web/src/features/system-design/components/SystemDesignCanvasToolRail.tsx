"use client";

import {
  Boxes,
  BoxSelect,
  Hand,
  LibraryBig,
  MousePointer2,
  Network,
  Pencil,
  StickyNote,
  Type,
} from "lucide-react";
import type { SystemDesignEditorTool } from "../types/system-design.types";
import { EditorIconButton } from "./SystemDesignUiPrimitives";

const tools: ReadonlyArray<{
  tool: SystemDesignEditorTool;
  label: string;
  Icon: typeof MousePointer2;
}> = [
  { tool: "select", label: "Select tool", Icon: MousePointer2 },
  { tool: "pan", label: "Pan tool", Icon: Hand },
  { tool: "connect", label: "Connect tool", Icon: Network },
  { tool: "draw", label: "Draw tool", Icon: Pencil },
  { tool: "text", label: "Add text", Icon: Type },
  { tool: "note", label: "Add note", Icon: StickyNote },
  { tool: "boundary", label: "Add system boundary", Icon: BoxSelect },
  { tool: "module", label: "Add module", Icon: Boxes },
];

export function SystemDesignCanvasToolRail({
  activeTool,
  paletteOpen,
  disabled = false,
  onToolChange,
  onTogglePalette,
}: {
  activeTool: SystemDesignEditorTool;
  paletteOpen: boolean;
  disabled?: boolean;
  onToolChange: (tool: SystemDesignEditorTool) => void;
  onTogglePalette: () => void;
}) {
  return (
    <div
      className="absolute left-3 top-3 z-20 flex w-11 flex-col items-center gap-0.5 rounded-lg border border-[var(--editor-border)] bg-[var(--editor-floating)] p-1 shadow-lg backdrop-blur transition-colors duration-150"
      role="toolbar"
      aria-label="Canvas tools"
    >
      {tools.map(({ tool, label, Icon }) => (
        <EditorIconButton
          key={tool}
          label={label}
          active={activeTool === tool}
          disabled={disabled}
          onClick={() => onToolChange(tool)}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </EditorIconButton>
      ))}
      <div className="my-1 h-px w-6 bg-[var(--editor-border)]" aria-hidden="true" />
      <EditorIconButton
        label={paletteOpen ? "Close component library" : "Open component library"}
        active={paletteOpen}
        disabled={disabled}
        onClick={onTogglePalette}
      >
        <LibraryBig className="h-4 w-4" aria-hidden="true" />
      </EditorIconButton>
    </div>
  );
}
