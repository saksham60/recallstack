import {
  REASONAI_PROTOCOL_VERSION,
  type ReasonAIEvent,
  type ReasonAIKnownEvent,
} from "./events";
import type { ReasonAIArtifactTouchedEntity, ReasonAISource } from "./types";

const KNOWN_EVENT_TYPES = new Set<ReasonAIKnownEvent["type"]>([
  "run.started",
  "run.heartbeat",
  "text.delta",
  "text.final",
  "tool.started",
  "tool.completed",
  "tool.failed",
  "sources.ready",
  "visual.ready",
  "artifact.proposal",
  "artifact.status",
  "run.completed",
  "run.failed",
  "run.cancelled",
]);

const MAX_ID_LENGTH = 256;
const MAX_TEXT_EVENT_LENGTH = 256_000;
const MAX_SUMMARY_LENGTH = 2_000;
const MAX_SOURCES = 100;
const MAX_TOUCHED_ENTITIES = 500;

export class ReasonAIProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReasonAIProtocolError";
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ReasonAIProtocolError("ReasonAI event must be an object.");
  }
  return value as Record<string, unknown>;
}

function stringField(
  value: Record<string, unknown>,
  field: string,
  maxLength: number,
): string {
  const fieldValue = value[field];
  if (
    typeof fieldValue !== "string"
    || fieldValue.length > maxLength
    || !fieldValue.trim()
    || fieldValue.trim() !== fieldValue
    || /[\u0000-\u001f\u007f]/u.test(fieldValue)
  ) throw new ReasonAIProtocolError(`ReasonAI event has an invalid ${field}.`);
  return fieldValue;
}

function textField(value: Record<string, unknown>, field: string, maxLength: number): string {
  const fieldValue = value[field];
  if (typeof fieldValue !== "string" || fieldValue.length > maxLength) {
    throw new ReasonAIProtocolError(`ReasonAI event has an invalid ${field}.`);
  }
  return fieldValue;
}

function optionalTextField(value: Record<string, unknown>, field: string, maxLength: number): string | undefined {
  if (value[field] === undefined) return undefined;
  return textField(value, field, maxLength);
}

function parseSource(value: unknown): ReasonAISource {
  const source = record(value);
  const url = stringField(source, "url", 2_048);
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
  } catch {
    throw new ReasonAIProtocolError("ReasonAI event has an invalid source URL.");
  }
  return {
    sourceId: stringField(source, "sourceId", MAX_ID_LENGTH),
    title: stringField(source, "title", 500),
    url,
    ...(source.kind === undefined ? {} : { kind: stringField(source, "kind", 100) }),
  };
}

function parseSources(value: unknown): ReasonAISource[] {
  if (!Array.isArray(value) || value.length > MAX_SOURCES) {
    throw new ReasonAIProtocolError("ReasonAI event has invalid sources.");
  }
  return value.map(parseSource);
}

function parseTouchedEntities(value: unknown): ReasonAIArtifactTouchedEntity[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_TOUCHED_ENTITIES) {
    throw new ReasonAIProtocolError("ReasonAI event has invalid touched entities.");
  }
  return value.map((item) => {
    const entity = record(item);
    return {
      entityType: stringField(entity, "entityType", 100),
      entityId: stringField(entity, "entityId", MAX_ID_LENGTH),
    };
  });
}

export function parseReasonAIEvent(value: unknown): ReasonAIEvent {
  const event = record(value);
  if (event.protocolVersion !== REASONAI_PROTOCOL_VERSION) {
    throw new ReasonAIProtocolError("Unsupported ReasonAI protocol version.");
  }
  const runId = stringField(event, "runId", MAX_ID_LENGTH);
  if (!Number.isSafeInteger(event.seq) || Number(event.seq) <= 0) {
    throw new ReasonAIProtocolError("ReasonAI event has an invalid sequence number.");
  }
  const eventType = stringField(event, "type", 200);
  const base = { protocolVersion: REASONAI_PROTOCOL_VERSION, runId, seq: Number(event.seq) };
  if (!KNOWN_EVENT_TYPES.has(eventType as ReasonAIKnownEvent["type"])) {
    return { ...base, type: "protocol.unknown", eventType };
  }

  switch (event.type) {
    case "run.started":
    case "run.heartbeat":
    case "run.completed":
    case "run.cancelled":
      return { ...base, type: event.type };
    case "text.delta":
      return {
        ...base,
        type: event.type,
        messageId: stringField(event, "messageId", MAX_ID_LENGTH),
        partId: stringField(event, "partId", MAX_ID_LENGTH),
        delta: textField(event, "delta", MAX_TEXT_EVENT_LENGTH),
      };
    case "text.final":
      return {
        ...base,
        type: event.type,
        messageId: stringField(event, "messageId", MAX_ID_LENGTH),
        partId: stringField(event, "partId", MAX_ID_LENGTH),
        text: textField(event, "text", MAX_TEXT_EVENT_LENGTH),
      };
    case "tool.started":
      return {
        ...base,
        type: event.type,
        messageId: stringField(event, "messageId", MAX_ID_LENGTH),
        toolCallId: stringField(event, "toolCallId", MAX_ID_LENGTH),
        toolName: stringField(event, "toolName", 200),
        ...(event.summary === undefined ? {} : { summary: optionalTextField(event, "summary", MAX_SUMMARY_LENGTH) }),
      };
    case "tool.completed":
    case "tool.failed":
      return {
        ...base,
        type: event.type,
        messageId: stringField(event, "messageId", MAX_ID_LENGTH),
        toolCallId: stringField(event, "toolCallId", MAX_ID_LENGTH),
        ...(event.summary === undefined ? {} : { summary: optionalTextField(event, "summary", MAX_SUMMARY_LENGTH) }),
      };
    case "sources.ready":
      if (event.retrievalStatus !== undefined && !["off", "used", "cached", "unavailable", "empty"].includes(String(event.retrievalStatus))) {
        throw new ReasonAIProtocolError("ReasonAI sources event has an invalid retrieval status.");
      }
      return {
        ...base,
        type: event.type,
        messageId: stringField(event, "messageId", MAX_ID_LENGTH),
        partId: stringField(event, "partId", MAX_ID_LENGTH),
        sources: parseSources(event.sources),
        ...(event.retrievalStatus === undefined ? {} : { retrievalStatus: event.retrievalStatus as "off" | "used" | "cached" | "unavailable" | "empty" }),
        ...(event.contextToken === undefined ? {} : { contextToken: textField(event, "contextToken", 64_000) }),
        ...(event.notice === undefined ? {} : { notice: optionalTextField(event, "notice", MAX_SUMMARY_LENGTH) }),
      };
    case "visual.ready":
      if (!("data" in event)) throw new ReasonAIProtocolError("ReasonAI visual event is missing data.");
      return {
        ...base,
        type: event.type,
        messageId: stringField(event, "messageId", MAX_ID_LENGTH),
        partId: stringField(event, "partId", MAX_ID_LENGTH),
        data: event.data,
      };
    case "artifact.proposal": {
      if (!("data" in event)) throw new ReasonAIProtocolError("ReasonAI artifact event is missing data.");
      const touchedEntities = parseTouchedEntities(event.touchedEntities);
      return {
        ...base,
        type: event.type,
        messageId: stringField(event, "messageId", MAX_ID_LENGTH),
        partId: stringField(event, "partId", MAX_ID_LENGTH),
        proposalId: stringField(event, "proposalId", MAX_ID_LENGTH),
        data: event.data,
        ...(event.baseArtifactFingerprint === undefined ? {} : { baseArtifactFingerprint: stringField(event, "baseArtifactFingerprint", 500) }),
        ...(touchedEntities === undefined ? {} : { touchedEntities }),
      };
    }
    case "artifact.status":
      if (!['applied', 'discarded', 'stale'].includes(String(event.status))) {
        throw new ReasonAIProtocolError("ReasonAI artifact event has an invalid status.");
      }
      return {
        ...base,
        type: event.type,
        messageId: stringField(event, "messageId", MAX_ID_LENGTH),
        proposalId: stringField(event, "proposalId", MAX_ID_LENGTH),
        status: event.status as "applied" | "discarded" | "stale",
      };
    case "run.failed":
      return {
        ...base,
        type: event.type,
        message: textField(event, "message", MAX_SUMMARY_LENGTH),
        ...(event.code === undefined ? {} : { code: stringField(event, "code", 200) }),
      };
  }
  throw new ReasonAIProtocolError("ReasonAI event has an unsupported type.");
}

export const parseReasonAIStreamEvent = parseReasonAIEvent;
