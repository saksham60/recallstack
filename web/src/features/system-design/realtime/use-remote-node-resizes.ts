"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SystemDesignRect } from "../types/system-design.types";
import type { NodeResizeOperation } from "./node-resize-operation";
import { REMOTE_NODE_DRAG_TIMEOUT_MS } from "./node-drag-preview";
import { RemoteNodeResizeRegistry } from "./node-resize-preview";

const EMPTY_FRAMES: Readonly<Record<string, SystemDesignRect>> = {};
const EMPTY_IDS: ReadonlySet<string> = new Set<string>();

export function useRemoteNodeResizes(activeDiagramId: string) {
  const registryRef = useRef(new RemoteNodeResizeRegistry());
  const timerRef = useRef<number | null>(null);
  const [snapshots, setSnapshots] = useState<
    ReadonlyMap<string, {
      frames: Readonly<Record<string, SystemDesignRect>>;
      nodeIds: ReadonlySet<string>;
    }>
  >(new Map());

  const refreshDiagram = useCallback((diagramId: string) => {
    const frames = registryRef.current.frames(diagramId);
    const nodeIds = registryRef.current.ownedNodeIds(diagramId);
    setSnapshots((current) => {
      const next = new Map(current);
      if (nodeIds.size === 0) next.delete(diagramId);
      else next.set(diagramId, { frames, nodeIds });
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
      if (registryRef.current.expire(Date.now(), REMOTE_NODE_DRAG_TIMEOUT_MS)) {
        setSnapshots((current) => {
          const next = new Map(current);
          current.forEach((_, diagramId) => {
            const nodeIds = registryRef.current.ownedNodeIds(diagramId);
            if (nodeIds.size === 0) next.delete(diagramId);
            else next.set(diagramId, {
              frames: registryRef.current.frames(diagramId),
              nodeIds,
            });
          });
          return next;
        });
      }
      if (!registryRef.current.hasSessions) stopTimer();
    }, 500);
  }, [stopTimer]);

  const receive = useCallback((actorId: string, operation: NodeResizeOperation) => {
    if (registryRef.current.apply(actorId, operation, Date.now())) {
      refreshDiagram(operation.diagramId);
    }
    if (registryRef.current.hasSessions) ensureTimer();
  }, [ensureTimer, refreshDiagram]);

  const finishCommittedResize = useCallback((diagramId: string, nodeId: string) => {
    if (registryRef.current.clearCommitted(diagramId, nodeId)) {
      refreshDiagram(diagramId);
    }
    if (!registryRef.current.hasSessions) stopTimer();
  }, [refreshDiagram, stopTimer]);

  const clearAll = useCallback(() => {
    registryRef.current.clearAll();
    stopTimer();
    setSnapshots(new Map());
  }, [stopTimer]);

  useEffect(() => () => {
    registryRef.current.clearAll();
    stopTimer();
  }, [stopTimer]);

  const active = snapshots.get(activeDiagramId);
  const frames = active?.frames ?? EMPTY_FRAMES;
  const remotelyResizedNodeIds = active?.nodeIds ?? EMPTY_IDS;
  return { frames, remotelyResizedNodeIds, receive, finishCommittedResize, clearAll };
}
