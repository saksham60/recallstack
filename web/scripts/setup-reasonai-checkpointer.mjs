import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required to initialize ReasonAI checkpoints.");
  process.exitCode = 1;
} else {
  let pool;
  let checkpointer;
  try {
    const hostname = new URL(connectionString).hostname;
    const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    pool = new Pool({
      connectionString,
      max: 1,
      ssl: local ? false : { rejectUnauthorized: true },
    });
    checkpointer = new PostgresSaver(pool, undefined, { schema: "reasonai_graph" });
    await checkpointer.setup();
    console.info("ReasonAI checkpoint schema is ready.");
  } catch (error) {
    console.error("ReasonAI checkpoint setup failed.", {
      category: error instanceof Error ? error.name : "unknown",
    });
    process.exitCode = 1;
  } finally {
    try {
      if (checkpointer) await checkpointer.end();
      else await pool?.end();
    } catch (error) {
      console.error("ReasonAI checkpoint cleanup failed.", {
        category: error instanceof Error ? error.name : "unknown",
      });
      process.exitCode = 1;
    }
  }
}
