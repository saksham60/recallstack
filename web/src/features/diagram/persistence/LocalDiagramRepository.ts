import { createDiagramDocumentSummary, createDiagramTimestamp, duplicateDiagramDocument } from "../core/state";
import type { DiagramDocument, DiagramDocumentSummary } from "../core/types";
import { parseDiagramDocument, type DiagramMigrationProvider } from "../import-export/json";
import { DiagramRepositoryError, type DiagramRepository } from "./DiagramRepository";

export interface DiagramStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

const DEFAULT_PREFIX = "recallstack:diagram:";

export class LocalDiagramRepository implements DiagramRepository {
  constructor(
    private readonly storage: DiagramStorageAdapter,
    private readonly migrations: readonly DiagramMigrationProvider[] = [],
    private readonly prefix = DEFAULT_PREFIX,
  ) {}

  private key(documentId: string): string {
    return `${this.prefix}${documentId}`;
  }

  async list(): Promise<DiagramDocumentSummary[]> {
    const summaries: DiagramDocumentSummary[] = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key?.startsWith(this.prefix)) continue;
      const raw = this.storage.getItem(key);
      if (!raw) continue;
      try {
        summaries.push(createDiagramDocumentSummary(parseDiagramDocument(JSON.parse(raw), this.migrations)));
      } catch {
        // A corrupt document must not hide otherwise valid local documents.
      }
    }
    return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async get(documentId: string): Promise<DiagramDocument | null> {
    const raw = this.storage.getItem(this.key(documentId));
    if (!raw) return null;
    try {
      return parseDiagramDocument(JSON.parse(raw), this.migrations);
    } catch (error) {
      throw new DiagramRepositoryError(`Unable to load diagram "${documentId}".`, error);
    }
  }

  async save(document: DiagramDocument): Promise<DiagramDocument> {
    try {
      const validated = parseDiagramDocument(document, this.migrations);
      this.storage.setItem(this.key(validated.id), JSON.stringify(validated));
      return validated;
    } catch (error) {
      throw new DiagramRepositoryError(`Unable to save diagram "${document.id}".`, error);
    }
  }

  async rename(documentId: string, title: string): Promise<DiagramDocument> {
    const document = await this.get(documentId);
    const nextTitle = title.trim();
    if (!document) throw new DiagramRepositoryError(`Diagram "${documentId}" does not exist.`);
    if (!nextTitle) throw new DiagramRepositoryError("A diagram title is required.");
    return this.save({ ...document, title: nextTitle, updatedAt: createDiagramTimestamp(document.updatedAt) });
  }

  async duplicate(documentId: string, title?: string): Promise<DiagramDocument> {
    const document = await this.get(documentId);
    if (!document) throw new DiagramRepositoryError(`Diagram "${documentId}" does not exist.`);
    return this.save(duplicateDiagramDocument(document, title?.trim() || undefined));
  }

  async remove(documentId: string): Promise<void> {
    this.storage.removeItem(this.key(documentId));
  }
}
