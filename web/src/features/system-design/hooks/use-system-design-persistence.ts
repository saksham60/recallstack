"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/telemetry/client";
import type { SystemDesignRepository } from "../repository/SystemDesignRepository";
import {
  systemDesignEditorActions,
  type SystemDesignEditorDispatch,
} from "../state/system-design-editor-actions";
import type {
  SystemDesignDocument,
  SystemDesignLoadStatus,
} from "../types/system-design.types";
import {
  recordSystemDesignDocumentCommit,
  recordSystemDesignPersistenceWrite,
} from "../utils/performance-instrumentation";

interface UseSystemDesignPersistenceOptions {
  enabled?: boolean;
  problemId?: string;
  fallbackDocument: SystemDesignDocument;
  document: SystemDesignDocument;
  isDirty: boolean;
  loadStatus: SystemDesignLoadStatus;
  repository: SystemDesignRepository;
  dispatch: SystemDesignEditorDispatch;
  autoSaveDelay?: number;
  initializeWhenDisabled?: boolean;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    const cause =
      "cause" in error && error.cause instanceof Error
        ? error.cause.message.trim()
        : "";
    return cause ? `${error.message} ${cause}` : error.message;
  }
  return fallback;
}

export function useSystemDesignPersistence({
  enabled = true,
  problemId,
  fallbackDocument,
  document,
  isDirty,
  loadStatus,
  repository,
  dispatch,
  autoSaveDelay = 800,
  initializeWhenDisabled = true,
}: UseSystemDesignPersistenceOptions) {
  const activeLoad = useRef(0);
  const lastTelemetrySave = useRef(0);
  const [reloadVersion, setReloadVersion] = useState(0);
  const latest = useRef({ document, isDirty, loadStatus });
  const previousDocumentUpdatedAt = useRef(document.updatedAt);

  useEffect(() => {
    latest.current = { document, isDirty, loadStatus };
    if (previousDocumentUpdatedAt.current !== document.updatedAt) {
      previousDocumentUpdatedAt.current = document.updatedAt;
      recordSystemDesignDocumentCommit();
    }
  }, [document, isDirty, loadStatus]);

  useEffect(() => {
    const loadId = activeLoad.current + 1;
    activeLoad.current = loadId;
    if (!enabled || !problemId) {
      if (initializeWhenDisabled) {
        dispatch(systemDesignEditorActions.loadSuccess(fallbackDocument, false));
      }
      return;
    }
    dispatch(systemDesignEditorActions.loadStart());

    void repository
      .getDocument(problemId)
      .then((savedDocument) => {
        if (activeLoad.current !== loadId) return;
        track("system_design.design_loaded", {}, problemId);
        dispatch(
          systemDesignEditorActions.loadSuccess(
            savedDocument ?? fallbackDocument,
            savedDocument !== null,
          ),
        );
      })
      .catch((error: unknown) => {
        if (activeLoad.current !== loadId) return;
        dispatch(
          systemDesignEditorActions.loadFailure(
            errorMessage(
              error,
              "The locally saved diagram could not be loaded.",
            ),
          ),
        );
      });

    return () => {
      if (activeLoad.current === loadId) activeLoad.current += 1;
    };
  }, [
    dispatch,
    enabled,
    fallbackDocument,
    initializeWhenDisabled,
    problemId,
    reloadVersion,
    repository,
  ]);

  const save = useCallback(
    async (snapshot = document) => {
      if (!enabled || !snapshot.problemId) return;
      const documentUpdatedAt = snapshot.updatedAt;
      dispatch(systemDesignEditorActions.saveStarted(documentUpdatedAt));
      try {
        recordSystemDesignPersistenceWrite();
        await repository.saveDocument(snapshot);
        if (Date.now()-lastTelemetrySave.current>60000) {
          lastTelemetrySave.current=Date.now(); track("system_design.save_succeeded", {}, snapshot.problemId);
        }
        dispatch(
          systemDesignEditorActions.saveSucceeded(
            documentUpdatedAt,
            new Date().toISOString(),
          ),
        );
      } catch (error) {
        track("system_design.save_failed", {}, snapshot.problemId);
        dispatch(
          systemDesignEditorActions.saveFailed(
            documentUpdatedAt,
            errorMessage(error, "The diagram could not be saved locally."),
          ),
        );
      }
    },
    [dispatch, document, enabled, repository],
  );

  useEffect(() => {
    if (!enabled || loadStatus !== "ready" || !isDirty) return;
    const snapshot = document;
    const timer = window.setTimeout(() => {
      void save(snapshot);
    }, autoSaveDelay);
    return () => window.clearTimeout(timer);
  }, [autoSaveDelay, document, enabled, isDirty, loadStatus, save]);

  useEffect(() => {
    const flushLatestDocument = () => {
      if (!enabled) return;
      const current = latest.current;
      if (current.loadStatus !== "ready" || !current.isDirty) return;
      // The local repository writes synchronously before its promise resolves,
      // so this also protects client-side navigation and page shutdown.
      recordSystemDesignPersistenceWrite();
      void repository.saveDocument(current.document).catch(() => {
        // Unload/navigation cannot reliably present async errors. The normal
        // manual and debounced save paths surface the same storage failure.
      });
    };
    const flushForLink = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("a[href]")) flushLatestDocument();
    };

    window.addEventListener("pagehide", flushLatestDocument);
    window.addEventListener("beforeunload", flushLatestDocument);
    window.addEventListener("popstate", flushLatestDocument);
    window.document.addEventListener("click", flushForLink, true);
    return () => {
      window.removeEventListener("pagehide", flushLatestDocument);
      window.removeEventListener("beforeunload", flushLatestDocument);
      window.removeEventListener("popstate", flushLatestDocument);
      window.document.removeEventListener("click", flushForLink, true);
    };
  }, [enabled, repository]);

  const retryLoad = useCallback(() => {
    setReloadVersion((version) => version + 1);
  }, []);

  return { save, retryLoad };
}
