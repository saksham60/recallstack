import type { ReasonAIEvent } from "./events";
import type {
  ReasonAIArtifactPart,
  ReasonAIArtifactStatus,
  ReasonAIMessagePart,
  ReasonAIMessageStatus,
  ReasonAIRuntimeMessage,
  ReasonAIRuntimeState,
  ReasonAITextPart,
  ReasonAIToolPart,
} from "./types";

export function createReasonAIRuntimeState(messages: ReasonAIRuntimeMessage[] = []): ReasonAIRuntimeState {
  return {
    runId: null,
    status: "idle",
    lastSeq: 0,
    messages,
    error: null,
    terminalEventReceived: false,
  };
}

export const initialReasonAIRuntimeState = createReasonAIRuntimeState();

function updateAssistantMessage(
  messages: ReasonAIRuntimeMessage[],
  messageId: string,
  update: (message: ReasonAIRuntimeMessage) => ReasonAIRuntimeMessage,
): ReasonAIRuntimeMessage[] {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index >= 0 && messages[index].role !== "assistant") return messages;

  const current: ReasonAIRuntimeMessage = index >= 0
    ? messages[index]
    : { id: messageId, role: "assistant", parts: [], status: "streaming" };
  const updated = update(current);
  if (index >= 0 && updated === current) return messages;
  if (index < 0 && updated === current) return messages;

  const next = messages.slice();
  if (index >= 0) next[index] = updated;
  else next.push(updated);
  return next;
}

function partId(part: ReasonAIMessagePart): string | undefined {
  return part.type === "tool" ? undefined : part.partId;
}

function upsertPart(
  messages: ReasonAIRuntimeMessage[],
  messageId: string,
  nextPart: ReasonAIMessagePart,
): ReasonAIRuntimeMessage[] {
  return updateAssistantMessage(messages, messageId, (message) => {
    const id = partId(nextPart);
    const index = id === undefined ? -1 : message.parts.findIndex((part) => partId(part) === id);
    if (index >= 0 && message.parts[index].type !== nextPart.type) return message;
    if (index < 0) return { ...message, parts: [...message.parts, nextPart] };
    const parts = message.parts.slice();
    parts[index] = nextPart;
    return { ...message, parts };
  });
}

function updateText(
  messages: ReasonAIRuntimeMessage[],
  messageId: string,
  targetPartId: string,
  text: string,
  finalized: boolean,
): ReasonAIRuntimeMessage[] {
  return updateAssistantMessage(messages, messageId, (message) => {
    const index = message.parts.findIndex((part) => partId(part) === targetPartId);
    if (index < 0) {
      return { ...message, parts: [...message.parts, { type: "text", partId: targetPartId, text, finalized }] };
    }
    const current = message.parts[index];
    if (current.type !== "text" || (current.finalized && !finalized)) return message;
    const part: ReasonAITextPart = {
      ...current,
      text: finalized ? text : current.text + text,
      finalized: current.finalized || finalized,
    };
    const parts = message.parts.slice();
    parts[index] = part;
    return { ...message, parts };
  });
}

function startTool(
  messages: ReasonAIRuntimeMessage[],
  messageId: string,
  toolCallId: string,
  toolName: string,
  summary?: string,
): ReasonAIRuntimeMessage[] {
  if (messages.some((message) => message.parts.some((part) => part.type === "tool" && part.toolCallId === toolCallId))) {
    return messages;
  }
  const tool: ReasonAIToolPart = {
    type: "tool",
    toolCallId,
    toolName,
    status: "running",
    ...(summary === undefined ? {} : { summary }),
  };
  return updateAssistantMessage(messages, messageId, (message) => ({ ...message, parts: [...message.parts, tool] }));
}

function finishTool(
  messages: ReasonAIRuntimeMessage[],
  messageId: string,
  toolCallId: string,
  status: "completed" | "failed",
  summary?: string,
): ReasonAIRuntimeMessage[] {
  return updateAssistantMessage(messages, messageId, (message) => {
    const index = message.parts.findIndex((part) => part.type === "tool" && part.toolCallId === toolCallId);
    if (index < 0) return message;
    const current = message.parts[index] as ReasonAIToolPart;
    if (current.status !== "running") return message;
    const parts = message.parts.slice();
    parts[index] = { ...current, status, ...(summary === undefined ? {} : { summary }) };
    return { ...message, parts };
  });
}

function updateArtifactStatus(
  messages: ReasonAIRuntimeMessage[],
  messageId: string,
  proposalId: string,
  status: Exclude<ReasonAIArtifactStatus, "proposed">,
): ReasonAIRuntimeMessage[] {
  return updateAssistantMessage(messages, messageId, (message) => {
    const index = message.parts.findIndex((part) => part.type === "artifact" && part.proposalId === proposalId);
    if (index < 0) return message;
    const current = message.parts[index] as ReasonAIArtifactPart;
    if (current.status !== "proposed") return message;
    const parts = message.parts.slice();
    parts[index] = { ...current, status };
    return { ...message, parts };
  });
}

function setStreamingMessageStatus(
  messages: ReasonAIRuntimeMessage[],
  status: ReasonAIMessageStatus,
): ReasonAIRuntimeMessage[] {
  let changed = false;
  const next = messages.map((message) => {
    if (message.role !== "assistant" || message.status !== "streaming") return message;
    changed = true;
    return { ...message, status };
  });
  return changed ? next : messages;
}

function advance(
  state: ReasonAIRuntimeState,
  event: ReasonAIEvent,
  messages = state.messages,
): ReasonAIRuntimeState {
  return { ...state, lastSeq: event.seq, messages };
}

/** Applies one validated event without side effects or in-place mutation. */
export function reduceReasonAIEvent(state: ReasonAIRuntimeState, event: ReasonAIEvent): ReasonAIRuntimeState {
  if (event.type === "run.started") {
    if (state.status !== "idle") return state;
    return {
      ...state,
      runId: event.runId,
      status: "running",
      lastSeq: event.seq,
      error: null,
      terminalEventReceived: false,
    };
  }

  if (
    state.status !== "running"
    || state.terminalEventReceived
    || state.runId !== event.runId
    || event.seq <= state.lastSeq
  ) return state;

  switch (event.type) {
    case "protocol.unknown":
    case "run.heartbeat":
      return advance(state, event);
    case "text.delta":
      return advance(state, event, updateText(state.messages, event.messageId, event.partId, event.delta, false));
    case "text.final":
      return advance(state, event, updateText(state.messages, event.messageId, event.partId, event.text, true));
    case "tool.started":
      return advance(state, event, startTool(state.messages, event.messageId, event.toolCallId, event.toolName, event.summary));
    case "tool.completed":
    case "tool.failed":
      return advance(state, event, finishTool(
        state.messages,
        event.messageId,
        event.toolCallId,
        event.type === "tool.completed" ? "completed" : "failed",
        event.summary,
      ));
    case "sources.ready":
      return advance(state, event, upsertPart(state.messages, event.messageId, {
        type: "sources",
        partId: event.partId,
        sources: event.sources,
        ...(event.retrievalStatus === undefined ? {} : { retrievalStatus: event.retrievalStatus }),
        ...(event.contextToken === undefined ? {} : { contextToken: event.contextToken }),
        ...(event.notice === undefined ? {} : { notice: event.notice }),
      }));
    case "visual.ready":
      return advance(state, event, upsertPart(state.messages, event.messageId, {
        type: "visual",
        partId: event.partId,
        data: event.data,
      }));
    case "artifact.proposal":
      return advance(state, event, upsertPart(state.messages, event.messageId, {
        type: "artifact",
        partId: event.partId,
        proposalId: event.proposalId,
        status: "proposed",
        data: event.data,
        ...(event.baseArtifactFingerprint === undefined ? {} : { baseArtifactFingerprint: event.baseArtifactFingerprint }),
        ...(event.touchedEntities === undefined ? {} : { touchedEntities: event.touchedEntities }),
      }));
    case "artifact.status":
      return advance(state, event, updateArtifactStatus(state.messages, event.messageId, event.proposalId, event.status));
    case "run.completed":
      return {
        ...state,
        status: "completed",
        lastSeq: event.seq,
        messages: setStreamingMessageStatus(state.messages, "completed"),
        terminalEventReceived: true,
      };
    case "run.failed":
      return {
        ...state,
        status: "failed",
        lastSeq: event.seq,
        messages: setStreamingMessageStatus(state.messages, "failed"),
        error: { message: event.message, ...(event.code === undefined ? {} : { code: event.code }) },
        terminalEventReceived: true,
      };
    case "run.cancelled":
      return {
        ...state,
        status: "cancelled",
        lastSeq: event.seq,
        messages: setStreamingMessageStatus(state.messages, "cancelled"),
        terminalEventReceived: true,
      };
  }
}

export function interruptReasonAIRun(state: ReasonAIRuntimeState): ReasonAIRuntimeState {
  if (state.status !== "running" || state.terminalEventReceived) return state;
  return {
    ...state,
    status: "interrupted",
    messages: setStreamingMessageStatus(state.messages, "interrupted"),
  };
}

export const reasonAIRuntimeReducer = reduceReasonAIEvent;
