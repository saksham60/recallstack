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
import {
  parseNodeDragOperation,
  type NodeDragOperation,
} from "./node-drag-operation";
import { NodeDragPreviewBroadcaster } from "./node-drag-preview";
import type { SystemDesignPoint } from "../types/system-design.types";
import {
  createRealtimeRoom,
  RealtimeClient,
  type RealtimeConnectionStatus,
  type RealtimeFailure,
} from "./realtime-client";

interface UseSystemDesignRealtimeOptions {
  initialRoomToken?: string;
  onInitialDocument: (document: SystemDesignDocument) => void;
  onReplaceDocument: (document: SystemDesignDocument) => void;
  onRemoteOperation: (operation: CanvasOperation) => void;
  onRemoteDragOperation: (
    actorId: string,
    operation: NodeDragOperation,
  ) => void;
}

export interface SystemDesignRealtimeController {
  status: RealtimeConnectionStatus;
  failure: RealtimeFailure | null;
  roomToken: string | null;
  shareUrl: string | null;
  isSlow: boolean;
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
  disconnect: () => void;
}

function createActorId(): string {
  return crypto.randomUUID();
}

export function useSystemDesignRealtime({
  initialRoomToken,
  onInitialDocument,
  onReplaceDocument,
  onRemoteOperation,
  onRemoteDragOperation,
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
  const actorIdRef = useRef<string | null>(null);
  const clientRef = useRef<RealtimeClient | null>(null);
  const createAbortRef = useRef<AbortController | null>(null);
  const callbacksRef = useRef({
    onInitialDocument,
    onReplaceDocument,
    onRemoteOperation,
    onRemoteDragOperation,
  });
  const connectionRoleRef = useRef<"host" | "guest">(
    initialRoomToken ? "guest" : "host",
  );
  const receivedStateRef = useRef(false);
  const dragBroadcasterRef = useRef<NodeDragPreviewBroadcaster | null>(null);

  useEffect(() => {
    const broadcaster = new NodeDragPreviewBroadcaster({
      send: (operation) =>
        clientRef.current?.sendEphemeral(operation) ?? false,
    });
    dragBroadcasterRef.current = broadcaster;
    return () => {
      broadcaster.cancel();
      dragBroadcasterRef.current = null;
    };
  }, []);

  useEffect(() => {
    callbacksRef.current = {
      onInitialDocument,
      onReplaceDocument,
      onRemoteOperation,
      onRemoteDragOperation,
    };
  }, [
    onInitialDocument,
    onRemoteDragOperation,
    onRemoteOperation,
    onReplaceDocument,
  ]);

  useEffect(() => {
    if (status !== "live") dragBroadcasterRef.current?.cancel();
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
          onStatus: setStatus,
          onFailure: setFailure,
          onCommittedOperation: (message) => {
            callbacksRef.current.onRemoteOperation(
              parseCanvasOperation(message.payload),
            );
          },
          onEphemeralOperation: (message) => {
            callbacksRef.current.onRemoteDragOperation(
              message.actorId,
              parseNodeDragOperation(message.payload),
            );
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

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  return {
    status,
    failure,
    roomToken,
    shareUrl,
    isSlow: slowStatus === status,
    startLiveSession,
    retryConnection,
    sendCommittedOperation,
    beginNodeDrag,
    previewNodeDrag,
    endNodeDrag,
    disconnect,
  };
}
