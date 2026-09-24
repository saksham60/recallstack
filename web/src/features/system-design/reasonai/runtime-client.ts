import type { ReasonAIRuntimeState } from "@/lib/reasonai/runtime/types";
import { parseSanitizedAIProposal } from "./sanitizeAIProposal";
import { parseReasonAISources, type ReasonAISource } from "./sources";
import { parseReasonAIVisualization, type ReasonAIVisualization } from "./visualization";
import type { ReasonAIContext, ReasonAIProposal } from "./contract";

export interface SystemDesignToolActivity {
  toolCallId: string;
  toolName: string;
  summary: string;
  status: "running" | "completed" | "failed";
}

export interface SystemDesignRuntimeResponse {
  text: string;
  proposal?: ReasonAIProposal;
  visualization?: ReasonAIVisualization;
  sources: ReasonAISource[];
  notice?: string;
  tools: SystemDesignToolActivity[];
}

export function systemDesignRuntimeResponse(
  state: ReasonAIRuntimeState,
  context: ReasonAIContext,
): SystemDesignRuntimeResponse | undefined {
  const assistant = [...state.messages].reverse().find((message) => message.role === "assistant");
  if (!assistant) return;
  const text = assistant.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
  const tools = assistant.parts.filter((part) => part.type === "tool").map((part) => ({
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    summary: part.summary ?? part.toolName,
    status: part.status,
  }));
  const sourcePart = [...assistant.parts].reverse().find((part) => part.type === "sources");
  const sources = parseReasonAISources(sourcePart?.sources.map((source, index) => ({
    id: Number(/^source-(\d+)$/u.exec(source.sourceId)?.[1] ?? index + 1),
    title: source.title,
    url: source.url,
  })));
  let proposal: ReasonAIProposal | undefined;
  const artifact = [...assistant.parts].reverse().find((part) => part.type === "artifact" && part.status === "proposed");
  try { if (artifact?.type === "artifact") proposal = parseSanitizedAIProposal(artifact.data, context); }
  catch { proposal = undefined; }
  let visualization: ReasonAIVisualization | undefined;
  const visual = [...assistant.parts].reverse().find((part) => part.type === "visual");
  try { if (visual?.type === "visual") visualization = parseReasonAIVisualization(visual.data, context, sources.map((source) => source.id)); }
  catch { visualization = undefined; }
  if (!text && !tools.length && !proposal && !visualization && !sourcePart?.notice) return;
  return {
    text,
    sources,
    tools,
    ...(proposal ? { proposal } : {}),
    ...(visualization ? { visualization } : {}),
    ...(sourcePart?.notice ? { notice: sourcePart.notice } : {}),
  };
}
