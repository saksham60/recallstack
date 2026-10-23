"use client";

import { useCallback, useEffect, useRef } from "react";
import { track } from "@/lib/telemetry/client";
import type { SystemDesignDocument } from "../types/system-design.types";

const empty = () => ({
  nodes_added: 0,
  nodes_deleted: 0,
  edges_added: 0,
  edges_removed: 0,
});

/** Count committed local structural edits; never retain diagram data or pointer movements. */
export function useCanvasTelemetry(entityId?: string) {
  const pending = useRef(empty());
  useEffect(() => {
    const flush = () => {
      const counts = pending.current;
      if (!Object.values(counts).some(Boolean)) return;
      pending.current = empty();
      track("system_design.operations_summarized", counts, entityId);
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const timer = window.setInterval(flush, 30000);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
      flush();
    };
  }, [entityId]);
  return useCallback(
    (before: SystemDesignDocument, after: SystemDesignDocument) => {
      if (before === after) return;
      for (const [kind, added, removed] of [
        ["nodes", "nodes_added", "nodes_deleted"],
        ["edges", "edges_added", "edges_removed"],
      ] as const) {
        const oldIds = new Set(
          Object.values(before.diagrams).flatMap((diagram) =>
            diagram[kind].map((item) => item.id),
          ),
        );
        const newIds = new Set(
          Object.values(after.diagrams).flatMap((diagram) =>
            diagram[kind].map((item) => item.id),
          ),
        );
        for (const id of newIds)
          if (!oldIds.has(id))
            pending.current[added] = Math.min(
              10000,
              pending.current[added] + 1,
            );
        for (const id of oldIds)
          if (!newIds.has(id))
            pending.current[removed] = Math.min(
              10000,
              pending.current[removed] + 1,
            );
      }
    },
    [],
  );
}
