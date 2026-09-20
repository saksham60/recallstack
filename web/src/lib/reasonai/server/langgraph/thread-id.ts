import "server-only";
import { createHmac } from "node:crypto";

export class ReasonAIThreadConfigurationError extends Error {
  constructor(message = "ReasonAI thread configuration is unavailable.") {
    super(message);
    this.name = "ReasonAIThreadConfigurationError";
  }
}

export function getReasonAIThreadSecret(testMode = false): string {
  if (testMode) return "reasonai-e2e-thread-secret-at-least-32-bytes";
  const secret = process.env.REASONAI_THREAD_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) throw new ReasonAIThreadConfigurationError();
  return secret;
}

/** Derives a stable opaque key. The raw conversation id is never part of the result. */
export function deriveDSAThreadId(conversationId: string, secret: string): string {
  if (Buffer.byteLength(secret, "utf8") < 32) throw new ReasonAIThreadConfigurationError();
  return `rai_dsa_${createHmac("sha256", secret).update(`dsa:${conversationId}`).digest("base64url")}`;
}
