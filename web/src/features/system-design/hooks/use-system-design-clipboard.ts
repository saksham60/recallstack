"use client";

import { useEffect } from "react";
import type {
  SystemDesignClipboardFragment,
  SystemDesignDocument,
  SystemDesignNodeAsset,
} from "../types/system-design.types";
import {
  SYSTEM_DESIGN_CLIPBOARD_MIME,
  createSystemDesignClipboardFragment,
  serializeSystemDesignClipboardFragment,
  tryParseSystemDesignClipboardFragment,
} from "../utils/system-design-clipboard";
import {
  createSystemDesignSvgAsset,
  readSystemDesignImageFile,
} from "../utils/system-design-assets";
import { isSystemDesignTypingTarget } from "./use-system-design-keyboard-shortcuts";

interface UseSystemDesignClipboardOptions {
  enabled: boolean;
  document: SystemDesignDocument;
  activeDiagramId: string;
  selectedNodeIds: readonly string[];
  hasSelection: boolean;
  onCopy: (fragment: SystemDesignClipboardFragment) => void;
  onCut: (fragment?: SystemDesignClipboardFragment) => void;
  onPasteFragment: (fragment: SystemDesignClipboardFragment) => void;
  onPasteText: (text: string) => void;
  onPasteAsset: (asset: SystemDesignNodeAsset) => void;
  onError: (message: string) => void;
}

function isCanvasClipboardTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : document.activeElement;
  return Boolean(element?.closest("[data-testid='system-design-canvas']"));
}

function getClipboardImageFile(data: DataTransfer): File | null {
  for (const item of Array.from(data.items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return Array.from(data.files).find((file) => file.type.startsWith("image/")) ?? null;
}

function getSvgFromHtml(html: string): string | null {
  if (!html.trim() || typeof DOMParser === "undefined") return null;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return parsed.querySelector("svg")?.outerHTML ?? null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "The clipboard content could not be pasted.";
}

export function useSystemDesignClipboard({
  enabled,
  document: designDocument,
  activeDiagramId,
  selectedNodeIds,
  hasSelection,
  onCopy,
  onCut,
  onPasteFragment,
  onPasteText,
  onPasteAsset,
  onError,
}: UseSystemDesignClipboardOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const createFragment = () =>
      createSystemDesignClipboardFragment(
        designDocument,
        activeDiagramId,
        selectedNodeIds,
      );

    const handleCopy = (event: ClipboardEvent) => {
      if (isSystemDesignTypingTarget(event.target) || !hasSelection) return;
      const fragment = createFragment();
      if (!fragment || !event.clipboardData) return;
      const serialized = serializeSystemDesignClipboardFragment(fragment);
      event.preventDefault();
      event.clipboardData.setData(SYSTEM_DESIGN_CLIPBOARD_MIME, serialized);
      event.clipboardData.setData("text/plain", serialized);
      onCopy(fragment);
    };

    const handleCut = (event: ClipboardEvent) => {
      if (isSystemDesignTypingTarget(event.target) || !hasSelection) return;
      const fragment = createFragment();
      if (fragment && event.clipboardData) {
        const serialized = serializeSystemDesignClipboardFragment(fragment);
        event.clipboardData.setData(SYSTEM_DESIGN_CLIPBOARD_MIME, serialized);
        event.clipboardData.setData("text/plain", serialized);
      }
      event.preventDefault();
      onCut(fragment ?? undefined);
    };

    const handlePaste = (event: ClipboardEvent) => {
      if (
        isSystemDesignTypingTarget(event.target) ||
        !isCanvasClipboardTarget(event.target) ||
        !event.clipboardData
      ) {
        return;
      }

      const data = event.clipboardData;
      const customFragment = data.getData(SYSTEM_DESIGN_CLIPBOARD_MIME);
      const plainText = data.getData("text/plain");
      const fragment = tryParseSystemDesignClipboardFragment(
        customFragment || plainText,
      );
      if (fragment) {
        event.preventDefault();
        onPasteFragment(fragment);
        return;
      }

      const imageFile = getClipboardImageFile(data);
      if (imageFile) {
        event.preventDefault();
        void readSystemDesignImageFile(imageFile)
          .then(onPasteAsset)
          .catch((error: unknown) => onError(errorMessage(error)));
        return;
      }

      const svg =
        (/^\s*<svg\b[\s\S]*<\/svg>\s*$/i.test(plainText)
          ? plainText
          : null) ?? getSvgFromHtml(data.getData("text/html"));
      if (svg) {
        event.preventDefault();
        try {
          onPasteAsset(createSystemDesignSvgAsset(svg, "Pasted SVG"));
        } catch (error) {
          onError(errorMessage(error));
        }
        return;
      }

      if (plainText) {
        event.preventDefault();
        onPasteText(plainText.replace(/\r\n?/g, "\n"));
      }
    };

    window.addEventListener("copy", handleCopy);
    window.addEventListener("cut", handleCut);
    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("copy", handleCopy);
      window.removeEventListener("cut", handleCut);
      window.removeEventListener("paste", handlePaste);
    };
  }, [
    activeDiagramId,
    designDocument,
    enabled,
    hasSelection,
    onCopy,
    onCut,
    onError,
    onPasteAsset,
    onPasteFragment,
    onPasteText,
    selectedNodeIds,
  ]);
}
