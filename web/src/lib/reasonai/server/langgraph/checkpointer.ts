import "server-only";
import { MemorySaver, type BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Pool } from "pg";

export const REASONAI_CHECKPOINT_SCHEMA = "reasonai_graph";

export class ReasonAICheckpointerUnavailableError extends Error {
  constructor(message = "ReasonAI durable memory is unavailable.") {
    super(message);
    this.name = "ReasonAICheckpointerUnavailableError";
  }
}

let productionPool: Pool | undefined;
let productionSaver: PostgresSaver | undefined;
const testSaver = new MemorySaver();

function usesLocalDatabase(connectionString: string): boolean {
  try {
    const hostname = new URL(connectionString).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    throw new ReasonAICheckpointerUnavailableError();
  }
}

/** Runtime construction only; setup() belongs exclusively to the one-time script. */
export function getReasonAICheckpointer(testMode = false): BaseCheckpointSaver {
  if (testMode) return testSaver;
  if (productionSaver) return productionSaver;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new ReasonAICheckpointerUnavailableError();
  productionPool = new Pool({
    connectionString,
    max: 1,
    ssl: usesLocalDatabase(connectionString) ? false : { rejectUnauthorized: true },
  });
  productionSaver = new PostgresSaver(productionPool, undefined, { schema: REASONAI_CHECKPOINT_SCHEMA });
  return productionSaver;
}

export async function assertCheckpointAvailable(checkpointer: BaseCheckpointSaver, threadId: string): Promise<void> {
  try {
    await checkpointer.getTuple({ configurable: { thread_id: threadId } });
  } catch (error) {
    console.error("[DSA_CHECKPOINTER_UNAVAILABLE]", {
      category: error instanceof Error ? error.name : "unknown",
    });
    throw new ReasonAICheckpointerUnavailableError();
  }
}
