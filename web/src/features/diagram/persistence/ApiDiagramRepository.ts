import type { DiagramDocument, DiagramDocumentSummary } from "../core/types";
import { parseDiagramDocument, type DiagramMigrationProvider } from "../import-export";
import { DiagramRepositoryError, type DiagramRepository } from "./DiagramRepository";

interface DiagramApiResponse {
  id: string;
  title: string;
  schema_version: number;
  document_json: unknown;
  revision: number;
  created_at: string;
  updated_at: string;
}

interface DiagramSummaryApiResponse {
  id: string;
  title: string;
  schema_version: number;
  revision: number;
  page_count: number;
  element_count: number;
  enabled_pack_ids: string[];
  created_at: string;
  updated_at: string;
}

export class DiagramRevisionConflictError extends DiagramRepositoryError {
  constructor(message: string) {
    super(message);
    this.name = "DiagramRevisionConflictError";
  }
}

export class DiagramRepositoryNetworkError extends DiagramRepositoryError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "DiagramRepositoryNetworkError";
  }
}

export class ApiDiagramRepository implements DiagramRepository {
  constructor(
    private readonly baseUrl: string,
    private readonly accessToken: () => Promise<string | null>,
    private readonly migrations: readonly DiagramMigrationProvider[] = [],
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.accessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init?.headers,
        },
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => ({})) as { detail?: string };
        const message = problem.detail || `Diagram request failed with status ${response.status}.`;
        if (response.status === 409) throw new DiagramRevisionConflictError(message);
        throw new DiagramRepositoryError(message);
      }
      return (response.status === 204 ? undefined : await response.json()) as T;
    } catch (error) {
      if (error instanceof DiagramRepositoryError) throw error;
      throw new DiagramRepositoryNetworkError("The diagram service is unavailable.", error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private document(response: DiagramApiResponse): DiagramDocument {
    const document = parseDiagramDocument(response.document_json, this.migrations);
    return { ...document, revision: response.revision, title: response.title, createdAt: response.created_at, updatedAt: response.updated_at };
  }

  async list(): Promise<DiagramDocumentSummary[]> {
    const values = await this.request<DiagramSummaryApiResponse[]>("/api/v1/diagrams");
    return values.map((value) => ({
      id: value.id,
      title: value.title,
      revision: value.revision,
      pageCount: value.page_count,
      elementCount: value.element_count,
      enabledPackIds: value.enabled_pack_ids,
      createdAt: value.created_at,
      updatedAt: value.updated_at,
    }));
  }

  async get(documentId: string): Promise<DiagramDocument | null> {
    try {
      return this.document(await this.request<DiagramApiResponse>(`/api/v1/diagrams/${encodeURIComponent(documentId)}`));
    } catch (error) {
      if (error instanceof DiagramRepositoryError && /not found/i.test(error.message)) return null;
      throw error;
    }
  }

  async save(document: DiagramDocument): Promise<DiagramDocument> {
    const creating = document.revision === 0;
    const response = await this.request<DiagramApiResponse>(creating ? "/api/v1/diagrams" : `/api/v1/diagrams/${encodeURIComponent(document.id)}`, {
      method: creating ? "POST" : "PUT",
      body: JSON.stringify(creating ? {
        id: document.id,
        title: document.title,
        schema_version: document.schemaVersion,
        document_json: document,
      } : {
        title: document.title,
        schema_version: document.schemaVersion,
        document_json: document,
        expected_revision: document.revision,
      }),
    });
    return this.document(response);
  }

  async rename(documentId: string, title: string): Promise<DiagramDocument> {
    const current = await this.get(documentId);
    if (!current) throw new DiagramRepositoryError(`Diagram "${documentId}" does not exist.`);
    const response = await this.request<DiagramApiResponse>(`/api/v1/diagrams/${encodeURIComponent(documentId)}`, { method: "PATCH", body: JSON.stringify({ title, expected_revision: current.revision }) });
    return this.document(response);
  }

  async duplicate(documentId: string, title?: string): Promise<DiagramDocument> {
    const response = await this.request<DiagramApiResponse>(`/api/v1/diagrams/${encodeURIComponent(documentId)}/duplicate`, { method: "POST", body: JSON.stringify({ title }) });
    return this.document(response);
  }

  async remove(documentId: string): Promise<void> {
    await this.request<void>(`/api/v1/diagrams/${encodeURIComponent(documentId)}`, { method: "DELETE" });
  }
}
