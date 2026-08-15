"use client";

import { useEffect } from "react";

interface SystemDesignShortcutHandlers {
  enabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSelectAll: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
  onSave: () => void;
  canNavigateParent?: boolean;
  onNavigateParent?: () => void;
  canOpenSelectedModule?: boolean;
  onOpenSelectedModule?: () => void;
}

export function isSystemDesignTypingTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable='true'], [role='textbox']",
    ),
  );
}

export function useSystemDesignKeyboardShortcuts({
  enabled,
  canUndo,
  canRedo,
  hasSelection,
  onUndo,
  onRedo,
  onSelectAll,
  onDuplicate,
  onDelete,
  onClearSelection,
  onSave,
  canNavigateParent = false,
  onNavigateParent,
  canOpenSelectedModule = false,
  onOpenSelectedModule,
}: SystemDesignShortcutHandlers) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isSystemDesignTypingTarget(event.target)) return;

      const command = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (event.altKey && event.key === "ArrowLeft" && canNavigateParent) {
        event.preventDefault();
        onNavigateParent?.();
        return;
      }

      if (
        !command &&
        !event.altKey &&
        event.key === "Enter" &&
        canOpenSelectedModule
      ) {
        event.preventDefault();
        onOpenSelectedModule?.();
        return;
      }

      if (command && key === "z") {
        if (event.shiftKey && canRedo) {
          event.preventDefault();
          onRedo();
        } else if (!event.shiftKey && canUndo) {
          event.preventDefault();
          onUndo();
        }
        return;
      }

      if (command && key === "y" && canRedo) {
        event.preventDefault();
        onRedo();
        return;
      }

      if (command && key === "a") {
        event.preventDefault();
        onSelectAll();
        return;
      }

      if (command && key === "d" && hasSelection) {
        event.preventDefault();
        onDuplicate();
        return;
      }

      if (command && key === "s") {
        event.preventDefault();
        onSave();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onClearSelection();
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        if (hasSelection) onDelete();
        return;
      }

      if (hasSelection && event.key === "Delete") {
        event.preventDefault();
        onDelete();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    canRedo,
    canUndo,
    canNavigateParent,
    canOpenSelectedModule,
    enabled,
    hasSelection,
    onClearSelection,
    onDelete,
    onDuplicate,
    onNavigateParent,
    onOpenSelectedModule,
    onRedo,
    onSave,
    onSelectAll,
    onUndo,
  ]);
}
