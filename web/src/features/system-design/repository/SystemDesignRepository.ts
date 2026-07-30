import type {
  SystemDesignDocument,
  SystemDesignDocumentSummary,
} from "../types/system-design.types";

export interface SystemDesignRepository {
  getDocument(problemId: string): Promise<SystemDesignDocument | null>;
  saveDocument(document: SystemDesignDocument): Promise<void>;
  deleteDocument(problemId: string): Promise<void>;
  listDocumentSummaries(): Promise<SystemDesignDocumentSummary[]>;
}

export type SystemDesignRepositoryOperation =
  | "read"
  | "save"
  | "delete"
  | "list";

export class SystemDesignRepositoryError extends Error {
  readonly operation: SystemDesignRepositoryOperation;
  readonly cause: unknown;

  constructor(
    operation: SystemDesignRepositoryOperation,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "SystemDesignRepositoryError";
    this.operation = operation;
    this.cause = cause;
  }
}
