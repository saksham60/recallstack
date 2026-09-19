import "server-only";
import { Annotation } from "@langchain/langgraph";
import type { DSATutorRequest, DSATutorResponse } from "@/features/dsa/reasonai/contract";

/** Request-scoped graph state. No checkpoint or conversation memory is attached. */
export const DSAGraphState = Annotation.Root({
  request: Annotation<DSATutorRequest>(),
  result: Annotation<DSATutorResponse | undefined>(),
});
