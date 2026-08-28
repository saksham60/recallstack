"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SystemDesignPoint } from "../types/system-design.types";
import type { NodeDragOperation } from "./node-drag-operation";
import {
  REMOTE_NODE_DRAG_TIMEOUT_MS,
  RemoteNodeDragRegistry,
  type RemoteDragMutation,
} from "./node-drag-preview";

const EXPIRY_POLL_INTERVAL_MS = 500;
const EMPTY_REMOTE_NODE_IDS: ReadonlySet<string> = new Set<string>();

interface UseRemoteNodeDragsOptions {
  activeDiagramId: string;
  onApplyPositions: (
    diagramId: string,
    positions: Readonly<Record<string, SystemDesignPoint>>,
  ) => void;
  onClearPositions: (diagramId: string, nodeIds: readonly string[]) => void;
}

export interface RemoteNodeDragController {
  remotelyDraggedNodeIds: ReadonlySet<string>;
  receive: (actorId: string, operation: NodeDragOperation) => void;
  finishCommittedMove: (
    diagramId: string,
    positions: Readonly<Record<string, SystemDesignPoint>>,
  ) => void;
  clearCommittedNodes: (diagramId: string, nodeIds: readonly string[]) => void;
  clearAll: () => void;
}

export function useRemoteNodeDrags({
  activeDiagramId,
  onApplyPositions,
  onClearPositions,
}: UseRemoteNodeDragsOptions): RemoteNodeDragController {
  const registryRef = useRef(new RemoteNodeDragRegistry());
  const callbacksRef = useRef({ onApplyPositions, onClearPositions });
  const expiryTimerRef = useRef<number | null>(null);
  const [ownershipByDiagram, setOwnershipByDiagram] = useState<
    ReadonlyMap<string, ReadonlySet<string>>
  >(new Map());

  useEffect(() => {
    callbacksRef.current = { onApplyPositions, onClearPositions };
  }, [onApplyPositions, onClearPositions]);

  const applyMutation = useCallback((mutation: RemoteDragMutation) => {
    if (Object.keys(mutation.previewPositions).length > 0) {
      callbacksRef.current.onApplyPositions(
        mutation.diagramId,
        mutation.previewPositions,
      );
    }
    if (mutation.clearedNodeIds.length > 0) {
      callbacksRef.current.onClearPositions(
        mutation.diagramId,
        mutation.clearedNodeIds,
      );
    }
    if (mutation.ownershipChanged) {
      const nodeIds = registryRef.current.ownedNodeIds(mutation.diagramId);
      setOwnershipByDiagram((current) => {
        const next = new Map(current);
        if (nodeIds.size === 0) next.delete(mutation.diagramId);
        else next.set(mutation.diagramId, nodeIds);
        return next;
      });
    }
  }, []);

  const stopExpiryTimer = useCallback(() => {
    if (expiryTimerRef.current === null) return;
    window.clearInterval(expiryTimerRef.current);
    expiryTimerRef.current = null;
  }, []);

  const ensureExpiryTimer = useCallback(() => {
    if (expiryTimerRef.current !== null) return;
    expiryTimerRef.current = window.setInterval(() => {
      const registry = registryRef.current;
      registry
        .expire(Date.now(), REMOTE_NODE_DRAG_TIMEOUT_MS)
        .forEach(applyMutation);
      if (!registry.hasActiveSessions()) stopExpiryTimer();
    }, EXPIRY_POLL_INTERVAL_MS);
  }, [applyMutation, stopExpiryTimer]);

  const receive = useCallback(
    (actorId: string, operation: NodeDragOperation) => {
      const mutation = registryRef.current.apply(
        actorId,
        operation,
        Date.now(),
      );
      if (mutation) applyMutation(mutation);
      if (registryRef.current.hasActiveSessions()) ensureExpiryTimer();
    },
    [applyMutation, ensureExpiryTimer],
  );

  const finishCommittedMove = useCallback(
    (
      diagramId: string,
      positions: Readonly<Record<string, SystemDesignPoint>>,
    ) => {
      const nodeIds = Object.keys(positions);
      const mutation = registryRef.current.clearCommitted(diagramId, nodeIds);
      if (mutation.ownershipChanged) {
        const remaining = registryRef.current.ownedNodeIds(diagramId);
        setOwnershipByDiagram((current) => {
          const next = new Map(current);
          if (remaining.size === 0) next.delete(diagramId);
          else next.set(diagramId, remaining);
          return next;
        });
      }
      callbacksRef.current.onApplyPositions(diagramId, positions);
      if (!registryRef.current.hasActiveSessions()) stopExpiryTimer();
    },
    [stopExpiryTimer],
  );

  const clearCommittedNodes = useCallback(
    (diagramId: string, nodeIds: readonly string[]) => {
      const mutation = registryRef.current.clearCommitted(diagramId, nodeIds);
      if (mutation.ownershipChanged) {
        const remaining = registryRef.current.ownedNodeIds(diagramId);
        setOwnershipByDiagram((current) => {
          const next = new Map(current);
          if (remaining.size === 0) next.delete(diagramId);
          else next.set(diagramId, remaining);
          return next;
        });
      }
      if (!registryRef.current.hasActiveSessions()) stopExpiryTimer();
    },
    [stopExpiryTimer],
  );

  const clearAll = useCallback(() => {
    registryRef.current.clearAll().forEach(applyMutation);
    stopExpiryTimer();
  }, [applyMutation, stopExpiryTimer]);

  useEffect(() => {
    const positions = registryRef.current.positionsForDiagram(activeDiagramId);
    if (Object.keys(positions).length > 0) {
      callbacksRef.current.onApplyPositions(activeDiagramId, positions);
    }
  }, [activeDiagramId, ownershipByDiagram]);

  useEffect(
    () => () => {
      stopExpiryTimer();
      registryRef.current.clearAll();
    },
    [stopExpiryTimer],
  );

  const remotelyDraggedNodeIds = useMemo(
    () => ownershipByDiagram.get(activeDiagramId) ?? EMPTY_REMOTE_NODE_IDS,
    [activeDiagramId, ownershipByDiagram],
  );

  return {
    remotelyDraggedNodeIds,
    receive,
    finishCommittedMove,
    clearCommittedNodes,
    clearAll,
  };
}
