"use client";

import { publicConfig } from "@/lib/config/public";
import { getBrowserClient } from "@/lib/supabase/client";
import type { DiagramDocument, DiagramDocumentSummary } from "../core/types";
import type { DiagramMigrationProvider } from "../import-export";
import { ApiDiagramRepository, DiagramRepositoryNetworkError } from "./ApiDiagramRepository";
import type { DiagramRepository } from "./DiagramRepository";
import { LocalDiagramRepository } from "./LocalDiagramRepository";

export class BrowserDiagramRepository implements DiagramRepository {
  lastSaveMode: "api" | "local-recovery" = "api";

  constructor(
    private readonly api: ApiDiagramRepository,
    private readonly local: LocalDiagramRepository,
  ) {}

  private async recover<T>(remote: () => Promise<T>, local: () => Promise<T>): Promise<T> {
    try {
      return await remote();
    } catch (error) {
      if (!(error instanceof DiagramRepositoryNetworkError)) throw error;
      return local();
    }
  }

  async list(): Promise<DiagramDocumentSummary[]> {
    const local = await this.local.list();
    try {
      const remote = await this.api.list();
      const merged = new Map(remote.map((summary) => [summary.id, summary]));
      for (const summary of local) if (!merged.has(summary.id)) merged.set(summary.id, summary);
      return [...merged.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    } catch (error) {
      if (error instanceof DiagramRepositoryNetworkError) return local;
      throw error;
    }
  }

  async get(documentId: string): Promise<DiagramDocument | null> {
    const remote = await this.recover(() => this.api.get(documentId), () => this.local.get(documentId));
    if (remote) await this.local.save(remote);
    return remote ?? this.local.get(documentId);
  }

  async save(document: DiagramDocument): Promise<DiagramDocument> {
    await this.local.save(document);
    try {
      const saved = await this.api.save(document);
      this.lastSaveMode = "api";
      await this.local.save(saved);
      return saved;
    } catch (error) {
      if (!(error instanceof DiagramRepositoryNetworkError)) throw error;
      this.lastSaveMode = "local-recovery";
      return document;
    }
  }

  async rename(documentId: string, title: string): Promise<DiagramDocument> {
    const renamed = await this.recover(() => this.api.rename(documentId, title), () => this.local.rename(documentId, title));
    await this.local.save(renamed);
    return renamed;
  }

  async duplicate(documentId: string, title?: string): Promise<DiagramDocument> {
    const duplicated = await this.recover(() => this.api.duplicate(documentId, title), () => this.local.duplicate(documentId, title));
    await this.local.save(duplicated);
    return duplicated;
  }

  async remove(documentId: string): Promise<void> {
    await this.recover(() => this.api.remove(documentId), () => this.local.remove(documentId));
    await this.local.remove(documentId);
  }
}

export function createBrowserDiagramRepository(
  migrations: readonly DiagramMigrationProvider[] = [],
): BrowserDiagramRepository | null {
  if (typeof window === "undefined") return null;
  const local = new LocalDiagramRepository(window.localStorage, migrations);
  const api = new ApiDiagramRepository(publicConfig.apiBaseUrl, async () => {
    const { data } = await getBrowserClient().auth.getSession();
    return data.session?.access_token ?? null;
  }, migrations);
  return new BrowserDiagramRepository(api, local);
}
