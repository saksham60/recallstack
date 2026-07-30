import type { SystemDesignDocument } from "../types/system-design.types";
import {
  SystemDesignValidationError,
  parseSystemDesignDocument,
} from "./diagram-validation";

export type SystemDesignImportErrorCode =
  | "invalid_json"
  | "invalid_document"
  | "problem_mismatch"
  | "file_read";

export class SystemDesignImportError extends Error {
  readonly code: SystemDesignImportErrorCode;
  readonly cause: unknown;

  constructor(
    code: SystemDesignImportErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "SystemDesignImportError";
    this.code = code;
    this.cause = cause;
  }
}

export interface SystemDesignExport {
  filename: string;
  json: string;
}

export function serializeSystemDesignDocument(
  document: SystemDesignDocument,
): string {
  return JSON.stringify(parseSystemDesignDocument(document), null, 2);
}

export function parseSystemDesignDocumentJson(
  json: string,
  expectedProblemId?: string,
): SystemDesignDocument {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch (error) {
    throw new SystemDesignImportError(
      "invalid_json",
      "The selected file does not contain valid JSON.",
      error,
    );
  }

  let document: SystemDesignDocument;
  try {
    document = parseSystemDesignDocument(value);
  } catch (error) {
    if (error instanceof SystemDesignValidationError) {
      throw new SystemDesignImportError(
        "invalid_document",
        error.message,
        error,
      );
    }
    throw error;
  }

  if (expectedProblemId && document.problemId !== expectedProblemId) {
    throw new SystemDesignImportError(
      "problem_mismatch",
      `This diagram belongs to "${document.problemId}", not "${expectedProblemId}".`,
    );
  }
  return document;
}

export function createSystemDesignExportFilename(problemSlug: string): string {
  const safeSlug =
    problemSlug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "diagram";
  return `${safeSlug}-system-design.json`;
}

export function prepareSystemDesignExport(
  document: SystemDesignDocument,
  problemSlug: string,
): SystemDesignExport {
  return {
    filename: createSystemDesignExportFilename(problemSlug),
    json: serializeSystemDesignDocument(document),
  };
}

export function downloadSystemDesignDocument(
  diagram: SystemDesignDocument,
  problemSlug: string,
): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Diagram downloads are only available in a browser.");
  }
  const exported = prepareSystemDesignExport(diagram, problemSlug);
  const url = URL.createObjectURL(
    new Blob([exported.json], { type: "application/json;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = exported.filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}

export async function readSystemDesignImportFile(
  file: File,
  expectedProblemId?: string,
): Promise<SystemDesignDocument> {
  let json: string;
  try {
    json = await file.text();
  } catch (error) {
    throw new SystemDesignImportError(
      "file_read",
      "The selected file could not be read.",
      error,
    );
  }
  return parseSystemDesignDocumentJson(json, expectedProblemId);
}
