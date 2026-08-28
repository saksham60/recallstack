"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { SystemDesignDocument } from "../types/system-design.types";
import {
  applyCanvasOperationsToDocument,
  reconstructRoomDocument,
} from "./apply-canvas-operation";
import {
  parseCanvasOperation,
  type CanvasOperation,
} from "./canvas-operation";
import type { NodeDragOperation } from "./node-drag-operation";
import type { NodeResizeOperation } from "./node-resize-operation";
import type { StrokeOperation } from "./stroke-operation";
import { parseSystemDesignEphemeralOperation } from "./ephemeral-operation";
import { NodeDragPreviewBroadcaster } from "./node-drag-preview";
import { NodeResizePreviewBroadcaster } from "./node-resize-preview";
import { StrokeDeltaBroadcaster } from "./stroke-preview";
import {
  CursorPresenceBroadcaster,
  parsePresencePayload,
  participantDefaults,
  type CollaborationParticipant,
  type PresencePayload,
} from "./presence";
import type { SystemDesignPoint } from "../types/system-design.types";
import {
  createRealtimeRoom,
  RealtimeClient,
  type RealtimeConnectionStatus,
  type RealtimeFailure,
} from "./realtime-client";

interface UseSystemDesignRealtimeOptions {
  initialRoomToken?: string;
  activeDiagramId: string;
  onInitialDocument: (document: SystemDesignDocument) => void;
  onReplaceDocument: (document: SystemDesignDocument) => void;
  onRemoteOperation: (operation: CanvasOperation) => void;
  onRemoteDragOperation: (
    actorId: string,
    operation: NodeDragOperation,
  ) => void;
  onRemoteResizeOperation: (
    actorId: string,
    operation: NodeResizeOperation,
  ) => void;
  onRemoteStrokeOperation: (actorId: string, operation: StrokeOperation) => void;
  onTransientReset: () => void;
}

export interface SystemDesignRealtimeController {
  status: RealtimeConnectionStatus;
  failure: RealtimeFailure | null;
  roomToken: string | null;
  shareUrl: string | null;
  isSlow: boolean;
  participants: readonly CollaborationParticipant[];
  startLiveSession: (document: SystemDesignDocument) => Promise<void>;
  retryConnection: () => void;
  sendCommittedOperation: (
    operation: CanvasOperation,
    checkpoint: SystemDesignDocument,
  ) => string | null;
  beginNodeDrag: (diagramId: string, nodeIds: readonly string[]) => void;
  previewNodeDrag: (
    positions: Readonly<Record<string, SystemDesignPoint>>,
  ) => void;
  endNodeDrag: () => void;
  beginNodeResize: (diagramId: string, nodeId: string) => void;
  previewNodeResize: (frame: { x: number; y: number; width: number; height: number }) => void;
  endNodeResize: () => void;
  beginFreehandStroke: (
    diagramId: string,
    firstPoint: SystemDesignPoint,
  ) => string | null;
  appendFreehandPoint: (point: SystemDesignPoint) => void;
  endFreehandStroke: () => void;
  updateCursor: (diagramId: string, point: SystemDesignPoint | null) => void;
  disconnect: () => void;
}

function createActorId(): string {
  return crypto.randomUUID();
}

export function useSystemDesignRealtime({
  initialRoomToken,
  activeDiagramId,
  onInitialDocument,
  onReplaceDocument,
  onRemoteOperation,
  onRemoteDragOperation,
  onRemoteResizeOperation,
  onRemoteStrokeOperation,
  onTransientReset,
}: UseSystemDesignRealtimeOptions): SystemDesignRealtimeController {
  const [status, setStatus] =
    useState<RealtimeConnectionStatus>(initialRoomToken ? "connecting" : "idle");
  const [failure, setFailure] = useState<RealtimeFailure | null>(null);
  const [roomToken, setRoomToken] = useState<string | null>(
    initialRoomToken ?? null,
  );
  const [shareUrl, setShareUrl] = useState<string | null>(() =>
    initialRoomToken && typeof window !== "undefined"
      ? `${window.location.origin}/system-design/live/${encodeURIComponent(initialRoomToken)}`
      : null,
  );
  const [slowStatus, setSlowStatus] =
    useState<RealtimeConnectionStatus | null>(null);
  const [participants, setParticipants] = useState<CollaborationParticipant[]>([]);
  const actorIdRef = useRef<string | null>(null);
  const clientRef = useRef<RealtimeClient | null>(null);
  const createAbortRef = useRef<AbortController | null>(null);
  const callbacksRef = useRef({
    onInitialDocument,
    onReplaceDocument,
    onRemoteOperation,
    onRemoteDragOperation,
    onRemoteResizeOperation,
    onRemoteStrokeOperation,
    onTransientReset,
  });
  const connectionRoleRef = useRef<"host" | "guest">(
    initialRoomToken ? "guest" : "host",
  );
  const receivedStateRef = useRef(false);
  const dragBroadcasterRef = useRef<NodeDragPreviewBroadcaster | null>(null);
  const resizeBroadcasterRef = useRef<NodeResizePreviewBroadcaster | null>(null);
  const strokeBroadcasterRef = useRef<StrokeDeltaBroadcaster | null>(null);
  const presenceBroadcasterRef = useRef<CursorPresenceBroadcaster | null>(null);
  const activeDiagramIdRef = useRef(activeDiagramId);

  useEffect(() => {
    activeDiagramIdRef.current = activeDiagramId;
  }, [activeDiagramId]);

  useEffect(() => {
    const broadcaster = new NodeDragPreviewBroadcaster({
      send: (operation) =>
        clientRef.current?.sendEphemeral(operation) ?? false,
    });
    dragBroadcasterRef.current = broadcaster;
    const resizeBroadcaster = new NodeResizePreviewBroadcaster({
      send: (operation) => clientRef.current?.sendEphemeral(operation) ?? false,
    });
    resizeBroadcasterRef.current = resizeBroadcaster;
    const strokeBroadcaster = new StrokeDeltaBroadcaster({
      send: (operation) => clientRef.current?.sendEphemeral(operation) ?? false,
    });
    strokeBroadcasterRef.current = strokeBroadcaster;
    const presenceBroadcaster = new CursorPresenceBroadcaster({
      send: (payload) => clientRef.current?.sendPresence(payload) ?? false,
    });
    presenceBroadcasterRef.current = presenceBroadcaster;
    return () => {
      broadcaster.cancel();
      dragBroadcasterRef.current = null;
      resizeBroadcaster.cancel();
      resizeBroadcasterRef.current = null;
      strokeBroadcaster.cancel();
      strokeBroadcasterRef.current = null;
      presenceBroadcaster.cancel();
      presenceBroadcasterRef.current = null;
    };
  }, []);

  useEffect(() => {
    callbacksRef.current = {
      onInitialDocument,
      onReplaceDocument,
      onRemoteOperation,
      onRemoteDragOperation,
      onRemoteResizeOperation,
      onRemoteStrokeOperation,
      onTransientReset,
    };
  }, [
    onInitialDocument,
    onRemoteDragOperation,
    onRemoteResizeOperation,
    onRemoteStrokeOperation,
    onTransientReset,
    onRemoteOperation,
    onReplaceDocument,
  ]);

  useEffect(() => {
    if (status !== "live") {
      dragBroadcasterRef.current?.cancel();
      resizeBroadcasterRef.current?.cancel();
      strokeBroadcasterRef.current?.cancel();
    }
  }, [status]);

  useEffect(() => {
    if (
      status !== "starting" &&
      status !== "connecting" &&
      status !== "reconnecting"
    ) {
      return;
    }
    const timer = window.setTimeout(() => setSlowStatus(status), 4_000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const connectToRoom = useCallback(
    (token: string, role: "host" | "guest") => {
      clientRef.current?.destroy();
      connectionRoleRef.current = role;
      receivedStateRef.current = false;
      actorIdRef.current ??= createActorId();
      const client = new RealtimeClient({
        roomToken: token,
        actorId: actorIdRef.current,
        callbacks: {
          onStatus: (nextStatus) => {
            setStatus(nextStatus);
            if (nextStatus !== "live") callbacksRef.current.onTransientReset();
            if (
              nextStatus === "closed" ||
              nextStatus === "error" ||
              nextStatus === "idle"
            ) {
              setParticipants([]);
            }
            if (nextStatus === "live") {
              const actorId = actorIdRef.current;
              if (actorId) {
                const identity = participantDefaults(actorId);
                const payload: PresencePayload = {
                  displayName: identity.displayName,
                  viewingDiagramId: activeDiagramIdRef.current,
                };
                presenceBroadcasterRef.current?.update(payload, true);
              }
            }
          },
          onFailure: setFailure,
          onCommittedOperation: (message) => {
            callbacksRef.current.onRemoteOperation(
              parseCanvasOperation(message.payload),
            );
          },
          onEphemeralOperation: (message) => {
            const operation = parseSystemDesignEphemeralOperation(message.payload);
            if (operation.kind.startsWith("node.drag.")) {
              callbacksRef.current.onRemoteDragOperation(
                message.actorId,
                operation as NodeDragOperation,
              );
            } else if (operation.kind.startsWith("node.resize.")) {
              callbacksRef.current.onRemoteResizeOperation(
                message.actorId,
                operation as NodeResizeOperation,
              );
            } else {
              callbacksRef.current.onRemoteStrokeOperation(
                message.actorId,
                operation as StrokeOperation,
              );
            }
          },
          onPresence: (message) => {
            const payload = parsePresencePayload(message.payload);
            setParticipants((current) => {
              if ("status" in payload && payload.status === "left") {
                return current.filter((entry) => entry.actorId !== message.actorId);
              }
              const existing = current.find((entry) => entry.actorId === message.actorId);
              const base = existing ?? participantDefaults(message.actorId);
              const next = "status" in payload
                ? base
                : {
                    ...base,
                    displayName: payload.displayName,
                    viewingDiagramId: payload.viewingDiagramId,
                    cursor: payload.cursor,
                  };
              return [...current.filter((entry) => entry.actorId !== message.actorId), next];
            });
          },
          onRoomState: (message, pendingOperations) => {
            const reconstructed = reconstructRoomDocument(
              message.snapshot,
              message.operations,
            );
            const document = applyCanvasOperationsToDocument(
              reconstructed,
              pendingOperations,
            );
            const isFirstState = !receivedStateRef.current;
            const localActorId = actorIdRef.current;
            const seeded: CollaborationParticipant[] = message.presence.flatMap((entry) => {
              const payload = parsePresencePayload(entry.payload);
              if ("status" in payload) return [];
              return [{
                ...participantDefaults(entry.actorId),
                displayName: payload.displayName,
                ...(payload.viewingDiagramId
                  ? { viewingDiagramId: payload.viewingDiagramId }
                  : {}),
                ...(payload.cursor ? { cursor: payload.cursor } : {}),
              }];
            });
            if (localActorId) seeded.push(participantDefaults(localActorId, true));
            setParticipants(seeded);
            receivedStateRef.current = true;
            if (isFirstState && connectionRoleRef.current === "host") return;
            if (isFirstState) {
              callbacksRef.current.onInitialDocument(document);
            } else {
              callbacksRef.current.onReplaceDocument(document);
            }
          },
        },
      });
      clientRef.current = client;
      setFailure(null);
      client.connect();
    },
    [],
  );

  useEffect(() => {
    if (!initialRoomToken) return;
    const task = window.setTimeout(
      () => connectToRoom(initialRoomToken, "guest"),
      0,
    );
    return () => {
      window.clearTimeout(task);
      clientRef.current?.destroy();
    };
  }, [connectToRoom, initialRoomToken]);

  useEffect(
    () => () => {
      const controller = createAbortRef.current;
      createAbortRef.current = null;
      controller?.abort();
      clientRef.current?.destroy();
    },
    [],
  );

  useEffect(() => {
    const handlePageHide = () => clientRef.current?.destroy();
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, []);

  const startLiveSession = useCallback(
    async (document: SystemDesignDocument) => {
      createAbortRef.current?.abort();
      clientRef.current?.destroy();
      setStatus("starting");
      setFailure(null);
      setRoomToken(null);
      setShareUrl(null);
      const controller = new AbortController();
      createAbortRef.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), 45_000);
      try {
        const room = await createRealtimeRoom(document, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setRoomToken(room.roomToken);
        setShareUrl(
          `${window.location.origin}/system-design/live/${encodeURIComponent(room.roomToken)}`,
        );
        connectToRoom(room.roomToken, "host");
      } catch {
        if (controller.signal.aborted && createAbortRef.current !== controller) {
          return;
        }
        setStatus("error");
        setFailure({
          kind: "connection_failed",
          message: "Couldn't start the live session.",
        });
      } finally {
        window.clearTimeout(timeout);
        if (createAbortRef.current === controller) {
          createAbortRef.current = null;
        }
      }
    },
    [connectToRoom],
  );

  const retryConnection = useCallback(() => {
    setFailure(null);
    clientRef.current?.retry();
  }, []);

  const sendCommittedOperation = useCallback(
    (operation: CanvasOperation, checkpoint: SystemDesignDocument) =>
      clientRef.current?.sendCommitted(operation, checkpoint) ?? null,
    [],
  );

  const beginNodeDrag = useCallback(
    (diagramId: string, nodeIds: readonly string[]) => {
      if (status !== "live" || nodeIds.length === 0) return;
      dragBroadcasterRef.current?.begin(diagramId, nodeIds);
    },
    [status],
  );

  const previewNodeDrag = useCallback(
    (positions: Readonly<Record<string, SystemDesignPoint>>) => {
      if (status !== "live") return;
      dragBroadcasterRef.current?.preview(positions);
    },
    [status],
  );

  const endNodeDrag = useCallback(() => {
    if (status !== "live") {
      dragBroadcasterRef.current?.cancel();
      return;
    }
    dragBroadcasterRef.current?.end();
  }, [status]);

  const beginNodeResize = useCallback((diagramId: string, nodeId: string) => {
    if (status === "live") resizeBroadcasterRef.current?.begin(diagramId, nodeId);
  }, [status]);

  const previewNodeResize = useCallback(
    (frame: { x: number; y: number; width: number; height: number }) => {
      if (status === "live") resizeBroadcasterRef.current?.preview(frame);
    },
    [status],
  );

  const endNodeResize = useCallback(() => {
    if (status === "live") resizeBroadcasterRef.current?.end();
    else resizeBroadcasterRef.current?.cancel();
  }, [status]);

  const beginFreehandStroke = useCallback(
    (diagramId: string, firstPoint: SystemDesignPoint) =>
      status === "live"
        ? strokeBroadcasterRef.current?.begin(diagramId, firstPoint) ?? null
        : null,
    [status],
  );

  const appendFreehandPoint = useCallback(
    (point: SystemDesignPoint) => {
      if (status === "live") strokeBroadcasterRef.current?.add(point);
    },
    [status],
  );

  const endFreehandStroke = useCallback(() => {
    if (status === "live") strokeBroadcasterRef.current?.end();
    else strokeBroadcasterRef.current?.cancel();
  }, [status]);

  const updateCursor = useCallback(
    (diagramId: string, point: SystemDesignPoint | null) => {
      if (status !== "live") return;
      const actorId = actorIdRef.current;
      if (!actorId) return;
      const identity = participantDefaults(actorId);
      presenceBroadcasterRef.current?.update({
        displayName: identity.displayName,
        viewingDiagramId: diagramId,
        ...(point ? { cursor: { diagramId, ...point } } : {}),
      });
    },
    [status],
  );

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  return {
    status,
    failure,
    roomToken,
    shareUrl,
    isSlow: slowStatus === status,
    participants,
    startLiveSession,
    retryConnection,
    sendCommittedOperation,
    beginNodeDrag,
    previewNodeDrag,
    endNodeDrag,
    beginNodeResize,
    previewNodeResize,
    endNodeResize,
    beginFreehandStroke,
    appendFreehandPoint,
    endFreehandStroke,
    updateCursor,
    disconnect,
  };
}
