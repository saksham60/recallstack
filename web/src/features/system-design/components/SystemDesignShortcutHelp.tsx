"use client";

import { Keyboard } from "lucide-react";
import { buttonClass } from "@/features/admin/components/AdminPrimitives";

export const SYSTEM_DESIGN_KEYBOARD_SHORTCUTS = [
  ["Temporarily pan canvas", "Hold Space + drag"],
  ["Undo", "Ctrl/Cmd + Z"],
  ["Redo", "Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y"],
  ["Select all", "Ctrl/Cmd + A"],
  ["Copy selection", "Ctrl/Cmd + C"],
  ["Cut selection", "Ctrl/Cmd + X"],
  ["Paste into focused canvas", "Ctrl/Cmd + V"],
  ["Duplicate", "Ctrl/Cmd + D"],
  ["Delete selection", "Delete or Backspace"],
  ["Clear selection", "Escape"],
  ["Open selected module", "Enter"],
  ["Return to parent", "Alt + Left"],
  ["Save", "Ctrl/Cmd + S"],
] as const;

export interface SystemDesignShortcutHelpProps {
  className?: string;
}

export function SystemDesignShortcutHelp({
  className = "",
}: SystemDesignShortcutHelpProps) {
  return (
    <details className={`group relative ${className}`}>
      <summary
        className={`${buttonClass} h-8 min-h-8 w-8 cursor-pointer list-none px-0 [&::-webkit-details-marker]:hidden`}
        aria-label="Show keyboard shortcuts"
        title="Keyboard shortcuts"
      >
        <Keyboard className="h-4 w-4" aria-hidden="true" />
      </summary>
      <div
        className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-border bg-surface p-3 shadow-2xl"
        role="group"
        aria-label="Keyboard shortcuts"
      >
        <div className="mb-2 flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">
            Keyboard shortcuts
          </h2>
        </div>
        <dl className="divide-y divide-border/70">
          {SYSTEM_DESIGN_KEYBOARD_SHORTCUTS.map(([label, keys]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 py-2 text-xs"
            >
              <dt className="text-muted">{label}</dt>
              <dd>
                <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                  {keys}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[10px] leading-relaxed text-muted">
          Editor shortcuts are paused while focus is inside a form field.
        </p>
      </div>
    </details>
  );
}
