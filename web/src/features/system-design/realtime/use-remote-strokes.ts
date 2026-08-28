"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StrokeOperation } from "./stroke-operation";
import {
  REMOTE_STROKE_TIMEOUT_MS,
  RemoteStrokeRegistry,
  type RemoteStrokePreview,
} from "./stroke-preview";

const EMPTY_PREVIEWS: readonly RemoteStrokePreview[] = [];

export function useRemoteStrokes(activeDiagramId: string) {
  const registryRef = useRef(new RemoteStrokeRegistry());
  const timerRef = useRef<number | null>(null);
  const [snapshots, setSnapshots] = useState<
    ReadonlyMap<string, readonly RemoteStrokePreview[]>
  >(new Map());

  const refresh = useCallback((diagramId: string) => {
    const previews = registryRef.current.previews(diagramId);
    setSnapshots((current) => {
      const next = new Map(current);
      if (previews.length === 0) next.delete(diagramId);
      else next.set(diagramId, previews);
      return next;
    });
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const ensureTimer = useCallback(() => {
    if (timerRef.current !== null) return;
    timerRef.current = window.setInterval(() => {
      if (registryRef.current.expire(Date.now(), REMOTE_STROKE_TIMEOUT_MS)) {
        setSnapshots((current) => {
          const next = new Map<string, readonly RemoteStrokePreview[]>();
          current.forEach((_, diagramId) => {
            const previews = registryRef.current.previews(diagramId);
            if (previews.length > 0) next.set(diagramId, previews);
          });
          return next;
        });
      }
      if (!registryRef.current.hasSessions) stopTimer();
    }, 500);
  }, [stopTimer]);

  const receive = useCallback(
    (actorId: string, operation: StrokeOperation) => {
      if (registryRef.current.apply(actorId, operation, Date.now())) {
        refresh(operation.diagramId);
      }
      if (registryRef.current.hasSessions) ensureTimer();
    },
    [ensureTimer, refresh],
  );

  const finishCommittedStroke = useCallback(
    (strokeSessionId: string) => {
      const affected = [...snapshots.entries()]
        .filter(([, previews]) =>
          previews.some((preview) => preview.strokeSessionId === strokeSessionId),
        )
        .map(([diagramId]) => diagramId);
      if (!registryRef.current.clearCommitted(strokeSessionId)) return;
      affected.forEach(refresh);
      if (!registryRef.current.hasSessions) stopTimer();
    },
    [refresh, snapshots, stopTimer],
  );

  const clearAll = useCallback(() => {
    registryRef.current.clearAll();
    stopTimer();
    setSnapshots(new Map());
  }, [stopTimer]);

  useEffect(
    () => () => {
      registryRef.current.clearAll();
      stopTimer();
    },
    [stopTimer],
  );

  return {
    previews: snapshots.get(activeDiagramId) ?? EMPTY_PREVIEWS,
    receive,
    finishCommittedStroke,
    clearAll,
  };
}
