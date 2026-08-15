import type { DiagramDocument, DiagramDocumentSummary } from "../core/types";

/** Persistence boundary for local, REST, database, or collaborative backends. */
export interface DiagramRepository {
  list(): Promise<DiagramDocumentSummary[]>;
  get(documentId: string): Promise<DiagramDocument | null>;
  save(document: DiagramDocument): Promise<DiagramDocument>;
  rename(documentId: string, title: string): Promise<DiagramDocument>;
  duplicate(documentId: string, title?: string): Promise<DiagramDocument>;
  remove(documentId: string): Promise<void>;
}

export class DiagramRepositoryError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "DiagramRepositoryError";
  }
}
