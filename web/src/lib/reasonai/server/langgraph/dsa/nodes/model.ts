import "server-only";
import { getWriter, type GraphNode } from "@langchain/langgraph";
import {
  dsaTutorProvider,
  DSATutorProviderError,
  type DSATutorProviderStreamEvent,
} from "@/features/dsa/reasonai/provider";
import { DSAGraphState } from "../state";

/** The sole PR3 graph node: request-scoped provider execution and event forwarding. */
export const dsaModelNode: GraphNode<typeof DSAGraphState> = async (state, config) => {
  const write = getWriter(config);
  let result;
  for await (const event of dsaTutorProvider.stream(state.request, config.signal)) {
    write?.(event satisfies DSATutorProviderStreamEvent);
    if (event.type === "result") result = event.result;
  }
  if (!result) throw new DSATutorProviderError("ReasonAI could not complete that response. Please try again.");
  return { result };
};
