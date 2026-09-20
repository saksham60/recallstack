import type { ReasonAIEndpoint, ReasonAIResponseMediaType } from "./authenticated-request";
import type { ReasonAIEvent } from "./runtime/events";
import { REASONAI_NDJSON_MEDIA_TYPE } from "./runtime/response";
import {
  decodeReasonAIStream,
  type ReasonAINDJSONDecoderOptions,
} from "./runtime/stream";

export type ReasonAIRequester = (
  endpoint: ReasonAIEndpoint,
  body: string,
  signal?: AbortSignal,
  accept?: ReasonAIResponseMediaType,
) => Promise<Response>;

export class ReasonAIStreamResponseError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ReasonAIStreamResponseError";
    this.status = status;
  }
}

function isNDJSON(response: Response): boolean {
  return response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase()
    === REASONAI_NDJSON_MEDIA_TYPE;
}

async function discardBody(response: Response): Promise<void> {
  try { await response.body?.cancel(); }
  catch (error) {
    console.error("[REASONAI_CLIENT_STREAM_CLEANUP_FAILED]", {
      category: error instanceof Error ? error.name : "unknown",
    });
  }
}

/** Validates and incrementally decodes an already-open ReasonAI response. */
export async function* decodeReasonAIEventResponse(
  response: Response,
  decoderOptions: ReasonAINDJSONDecoderOptions = {},
): AsyncGenerator<ReasonAIEvent> {
  if (!response.ok) {
    await discardBody(response);
    throw new ReasonAIStreamResponseError("ReasonAI stream request failed.", response.status);
  }
  if (!isNDJSON(response)) {
    await discardBody(response);
    throw new ReasonAIStreamResponseError("ReasonAI stream returned an unsupported content type.");
  }
  if (!response.body) {
    throw new ReasonAIStreamResponseError("ReasonAI stream response did not include a body.");
  }

  yield* decodeReasonAIStream(response.body, decoderOptions);
}

/** Opens and incrementally decodes an authenticated ReasonAI event response. */
export async function* requestReasonAIEventStream(
  request: ReasonAIRequester,
  endpoint: ReasonAIEndpoint,
  body: string,
  signal?: AbortSignal,
  decoderOptions: ReasonAINDJSONDecoderOptions = {},
): AsyncGenerator<ReasonAIEvent> {
  signal?.throwIfAborted();
  const response = await request(endpoint, body, signal, REASONAI_NDJSON_MEDIA_TYPE);
  yield* decodeReasonAIEventResponse(response, decoderOptions);
}
