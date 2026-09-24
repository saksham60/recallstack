import type { ReasonAIProposal, ReasonAIResponse } from "@/features/system-design/reasonai/contract";
import type { ReasonAIVisualization } from "@/features/system-design/reasonai/visualization";
import type { TavilyEvidence } from "@/lib/tavily/search";

export type SystemDesignGraphStreamEvent =
  | { type: "text.delta"; delta: string }
  | { type: "result"; result: ReasonAIResponse }
  | { type: "tool.started"; toolCallId: string; toolName: string; summary: string }
  | { type: "tool.completed"; toolCallId: string; summary: string }
  | { type: "tool.failed"; toolCallId: string; summary: string }
  | { type: "sources"; sources: Array<TavilyEvidence & { id: number }>; retrievalStatus: "used" | "empty" }
  | { type: "proposal"; proposal: ReasonAIProposal }
  | { type: "analysis"; visualization: ReasonAIVisualization };

export type SystemDesignGraphStage =
  | "graph.started"
  | "provider.started"
  | "agent.started"
  | "agent.tool_requested"
  | "final_model.started"
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "tool.limit_reached";
