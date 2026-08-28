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
  });
  const connectionRoleRef = useRef<"host" | "guest">(
    initialRoomToken ? "guest" : "host",
  );
  const receivedStateRef = useRef(false);

  useEffect(() => {
    callbacksRef.current = {
      onInitialDocument,
      onReplaceDocument,
      onRemoteOperation,
    };
  }, [onInitialDocument, onRemoteOperation, onReplaceDocument]);

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
    disconnect,
  };
}
