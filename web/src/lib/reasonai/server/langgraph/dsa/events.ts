import type { DSATutorResponse } from "@/features/dsa/reasonai/contract";
import type { WebContext } from "@/features/dsa/reasonai/web-context";

export type DSAGraphStreamEvent =
  | { type: "text.delta"; delta: string }
  | { type: "result"; result: DSATutorResponse }
  | { type: "tool.started"; toolCallId: string; toolName: string; summary: string }
  | { type: "tool.completed"; toolCallId: string; summary: string }
  | { type: "tool.failed"; toolCallId: string; summary: string }
  | { type: "sources"; sources: WebContext["results"]; retrievalStatus: "used" | "empty" }
  | { type: "visual"; visual: NonNullable<DSATutorResponse["visual"]> };

export type DSAGraphStage =
  | "graph.started"
  | "provider.started"
  | "agent.started"
  | "agent.tool_requested"
  | "final_model.started"
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "tool.limit_reached";
