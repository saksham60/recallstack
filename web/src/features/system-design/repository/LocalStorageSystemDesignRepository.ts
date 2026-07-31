import {
  SYSTEM_DESIGN_LEGACY_SCHEMA_VERSION,
  type SystemDesignDocument,
  type SystemDesignDocumentSummary,
} from "../types/system-design.types";
import { parseSystemDesignDocument } from "../utils/diagram-validation";
import { createSystemDesignDocumentSummary } from "../utils/system-design-defaults";
import {
  SystemDesignRepositoryError,
  type SystemDesignRepository,
  type SystemDesignRepositoryOperation,
} from "./SystemDesignRepository";

export const SYSTEM_DESIGN_STORAGE_KEY_PREFIX =
  "recallstack:admin:system-design:";

type StorageSource = Storage | (() => Storage);

export class LocalStorageSystemDesignRepository
  implements SystemDesignRepository
{
  constructor(private readonly storageSource?: StorageSource) {}

  static storageKey(problemId: string): string {
    return `${SYSTEM_DESIGN_STORAGE_KEY_PREFIX}${problemId}`;
  }

  async getDocument(problemId: string): Promise<SystemDesignDocument | null> {
    return this.run("read", () => {
      const serialized = this.getStorage().getItem(
        LocalStorageSystemDesignRepository.storageKey(problemId),
      );
      if (serialized === null) return null;
      let value: unknown;
      try {
        value = JSON.parse(serialized) as unknown;
      } catch (error) {
        throw new Error("The locally saved diagram is not valid JSON.", {
          cause: error,
        });
      }
      const document = parseSystemDesignDocument(value);
      if (document.problemId !== problemId) {
        throw new Error(
          "The locally saved diagram belongs to a different problem.",
        );
      }
      this.persistMigrationIfNeeded(
        LocalStorageSystemDesignRepository.storageKey(problemId),
        value,
        document,
      );
      return document;
    });
  }

  async saveDocument(document: SystemDesignDocument): Promise<void> {
    return this.run("save", () => {
      const validated = parseSystemDesignDocument(document);
      this.getStorage().setItem(
        LocalStorageSystemDesignRepository.storageKey(validated.problemId),
        JSON.stringify(validated),
      );
    });
  }

  async deleteDocument(problemId: string): Promise<void> {
    return this.run("delete", () => {
      this.getStorage().removeItem(
        LocalStorageSystemDesignRepository.storageKey(problemId),
      );
    });
  }

  async listDocumentSummaries(): Promise<SystemDesignDocumentSummary[]> {
    return this.run("list", () => {
      const storage = this.getStorage();
      const summaries: SystemDesignDocumentSummary[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key?.startsWith(SYSTEM_DESIGN_STORAGE_KEY_PREFIX)) continue;
        const serialized = storage.getItem(key);
        if (serialized === null) continue;
        let value: unknown;
        try {
          value = JSON.parse(serialized) as unknown;
        } catch (error) {
          throw new Error(`The saved diagram at "${key}" is not valid JSON.`, {
            cause: error,
          });
        }
        const document = parseSystemDesignDocument(value);
        this.persistMigrationIfNeeded(key, value, document);
        summaries.push(createSystemDesignDocumentSummary(document));
      }
      return summaries.sort(
        (left, right) =>
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      );
    });
  }

  private getStorage(): Storage {
    if (typeof this.storageSource === "function") {
      return this.storageSource();
    }
    if (this.storageSource) return this.storageSource;
    if (typeof window === "undefined") {
      throw new Error(
        "Local diagram storage is only available in a browser environment.",
      );
    }
    return window.localStorage;
  }

  private persistMigrationIfNeeded(
    key: string,
    original: unknown,
    migrated: SystemDesignDocument,
  ): void {
    if (
      typeof original === "object" &&
      original !== null &&
      "schemaVersion" in original &&
      original.schemaVersion === SYSTEM_DESIGN_LEGACY_SCHEMA_VERSION
    ) {
      this.getStorage().setItem(key, JSON.stringify(migrated));
    }
  }

  private async run<T>(
    operation: SystemDesignRepositoryOperation,
    task: () => T,
  ): Promise<T> {
    try {
      return task();
    } catch (error) {
      if (error instanceof SystemDesignRepositoryError) throw error;
      const messages: Record<SystemDesignRepositoryOperation, string> = {
        read: "The diagram could not be loaded from local storage.",
        save: "The diagram could not be saved to local storage.",
        delete: "The saved diagram could not be removed from local storage.",
        list: "Saved diagram summaries could not be read from local storage.",
      };
      throw new SystemDesignRepositoryError(
        operation,
        messages[operation],
        error,
      );
    }
  }
}
