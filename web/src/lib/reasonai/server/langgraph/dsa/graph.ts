import "server-only";
import { END, START, StateGraph } from "@langchain/langgraph";
import type { DSATutorRequest } from "@/features/dsa/reasonai/contract";
import type { DSATutorProviderStreamEvent } from "@/features/dsa/reasonai/provider";
import { dsaModelNode } from "./nodes/model";
import { DSAGraphState } from "./state";

const graph = new StateGraph(DSAGraphState)
  .addNode("model", dsaModelNode)
  .addEdge(START, "model")
  .addEdge("model", END)
  .compile();

function providerEvent(value: unknown): value is DSATutorProviderStreamEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return event.type === "text.delta" && typeof event.delta === "string"
    || event.type === "result" && Boolean(event.result) && typeof event.result === "object";
}

/** Runs the single-node graph and exposes only explicitly written provider events. */
export async function* streamDSAGraph(
  request: DSATutorRequest,
  signal?: AbortSignal,
): AsyncGenerator<DSATutorProviderStreamEvent> {
  const output = await graph.stream({ request }, { signal, streamMode: "custom" });
  for await (const event of output) {
    if (!providerEvent(event)) throw new Error("DSA graph emitted an invalid event.");
    yield event;
  }
}
