"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, LoaderCircle, Radio, RotateCw, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { buttonClass } from "@/features/admin/components/AdminPrimitives";
import type {
  RealtimeConnectionStatus,
  RealtimeFailure,
} from "../realtime/realtime-client";
import type { CollaborationParticipant } from "../realtime/presence";

interface SystemDesignLiveShareModalProps {
  open: boolean;
  status: RealtimeConnectionStatus;
  failure: RealtimeFailure | null;
  shareUrl: string | null;
  participants: readonly CollaborationParticipant[];
  isSlow: boolean;
  onClose: () => void;
  onRetry: () => void;
  onStartNew?: () => void;
}

function statusCopy(status: RealtimeConnectionStatus): string {
  if (status === "starting") return "Starting live session…";
  if (status === "connecting") return "Connecting…";
  if (status === "reconnecting") return "Reconnecting…";
  if (status === "live") return "Connected";
  if (status === "closed") return "Session ended";
  return "Live session";
}

export function SystemDesignLiveShareModal({
  open,
  status,
  failure,
  shareUrl,
  participants,
  isSlow,
  onClose,
  onRetry,
  onStartNew,
}: SystemDesignLiveShareModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, open]);

  if (!open) return null;
  const waiting =
    status === "starting" ||
    status === "connecting" ||
    status === "reconnecting";

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1_800);
    } catch {
      setCopyState("error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-share-title"
        aria-describedby="live-share-description"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
              <Radio className="h-5 w-5" aria-hidden="true" />
              {status === "live" && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-success ring-2 ring-surface" />
              )}
            </span>
            <div className="min-w-0">
              <h2 id="live-share-title" className="text-lg font-semibold">
                {status === "live" ? "Live session" : statusCopy(status)}
              </h2>
              <p id="live-share-description" className="mt-1 text-sm text-muted">
                Anyone with this link can join and edit this canvas.
              </p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            className={`${buttonClass} h-8 min-h-8 w-8 shrink-0 px-0`}
            aria-label="Close live share"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {failure ? (
            <div className="rounded-xl border border-danger/35 bg-danger/5 p-4">
              <p className="text-sm font-semibold text-foreground">
                {failure.kind === "room_full"
                  ? "Room full"
                  : failure.kind === "ended"
                    ? "This live session has ended"
                    : "Couldn't connect to the live session"}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted">
                {failure.message}
              </p>
              {failure.kind !== "ended" && (
                <button
                  type="button"
                  className={`${buttonClass} mt-4 gap-2`}
                  onClick={onRetry}
                >
                  <RotateCw className="h-4 w-4" aria-hidden="true" />
                  Try again
                </button>
              )}
              {failure.kind === "ended" && onStartNew && (
                <button
                  type="button"
                  className={`${buttonClass} mt-4 gap-2 border-accent/40`}
                  onClick={onStartNew}
                >
                  <Radio className="h-4 w-4" aria-hidden="true" />
                  Start new live session
                </button>
              )}
            </div>
          ) : waiting && !shareUrl ? (
            <div className="flex min-h-28 items-center gap-4 rounded-xl border border-border bg-background/45 p-4">
              <LoaderCircle
                className="h-6 w-6 shrink-0 animate-spin text-accent"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {statusCopy(status)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {isSlow
                    ? "The collaboration service may take a moment to wake."
                    : "Preparing a secure link for this canvas."}
                </p>
              </div>

            </div>
          ) : (
            <>
              <div>
                <label
                  htmlFor="live-share-url"
                  className="text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  Share link
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="live-share-url"
                    readOnly
                    value={shareUrl ?? ""}
                    className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    type="button"
                    className={`${buttonClass} min-w-24 gap-2 border-accent/40`}
                    onClick={() => void copyLink()}
                    disabled={!shareUrl}
                  >
                    {copyState === "copied" ? (
                      <Check className="h-4 w-4 text-success" aria-hidden="true" />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    )}
                    {copyState === "copied" ? "Copied" : "Copy link"}
                  </button>
                </div>
                {copyState === "error" && (
                  <p className="mt-2 text-xs text-danger">
                    Select the link and copy it manually.
                  </p>
                )}
              </div>

              {shareUrl && (
                <div className="grid gap-4 rounded-xl border border-border bg-background/35 p-4 sm:grid-cols-[132px_1fr]">
                  <div className="flex h-[132px] w-[132px] items-center justify-center rounded-lg bg-white p-2">
                    <QRCodeSVG
                      value={shareUrl}
                      size={116}
                      level="M"
                      title="Live session QR code"
                      aria-label="Live session QR code"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      Scan to join
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      Open the camera on another laptop, browser, or tablet and scan this code.
                    </p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                      Participants ({participants.length})
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {participants.map((participant) => (
                        <span
                          key={participant.actorId}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-1 text-xs"
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: participant.color }}
                          />
                          {participant.isLocal ? "You" : participant.displayName}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border border-border bg-background/35 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      status === "live"
                        ? "bg-success"
                        : "animate-pulse bg-warning"
                    }`}
                  />
                  {statusCopy(status)}
                </span>
                {waiting && isSlow && (
                  <span className="text-xs text-muted">Still working…</span>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-border bg-background/25 px-6 py-4">
          <button
            type="button"
            className={`${buttonClass} border-accent bg-accent text-accent-foreground`}
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </section>
    </div>
  );
}
