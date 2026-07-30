"use client";

import { useEffect } from "react";

interface SystemDesignShortcutHandlers {
  enabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
  onSave: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
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
  onCopy,
  onPaste,
  onDuplicate,
  onDelete,
  onClearSelection,
  onSave,
}: SystemDesignShortcutHandlers) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      const command = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

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

      if (command && key === "c" && hasSelection) {
        event.preventDefault();
        onCopy();
        return;
      }

      if (command && key === "v") {
        event.preventDefault();
        onPaste();
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
    enabled,
    hasSelection,
    onClearSelection,
    onCopy,
    onDelete,
    onDuplicate,
    onPaste,
    onRedo,
    onSave,
    onUndo,
  ]);
}
