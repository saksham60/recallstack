import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { ReasonAIKnownEvent } from "@/lib/reasonai/runtime/events";

type ToolMeasurement = {
  requested: number;
  completed: number;
  failed: number;
  duration_ms: number;
};
const bounded = (value: number) =>
  Math.max(0, Math.min(3600000, Math.round(value)));
/** Metadata-only reduction; private text, tool arguments and sources are never copied. */
export class AIRunMeasurements {
  private started = Date.now();
  private firstOutput: number | null = null;
  private active = new Map<string, { name: string; at: number }>();
  private tools: Record<string, ToolMeasurement> = {};
  private models = new Set<string>();
  observe(event: ReasonAIKnownEvent) {
    if (
      ((event.type === "text.delta" && event.delta.length > 0) ||
        event.type === "text.final") &&
      this.firstOutput === null
    )
      this.firstOutput = bounded(Date.now() - this.started);
    if (event.type === "tool.started" && this.active.size < 32) {
      const name = [
        "search_web",
        "create_visual",
        "propose_canvas_changes",
        "show_architecture_analysis",
      ].includes(event.toolName)
        ? event.toolName
        : "other";
      if (Object.keys(this.tools).length >= 16 && !this.tools[name]) return;
      this.active.set(event.toolCallId, { name, at: Date.now() });
      (this.tools[name] ??= {
        requested: 0,
        completed: 0,
        failed: 0,
        duration_ms: 0,
      }).requested++;
    }
    if (event.type === "tool.completed" || event.type === "tool.failed") {
      const tool = this.active.get(event.toolCallId);
      if (tool) {
        const row = this.tools[tool.name];
        if (event.type === "tool.completed") row.completed++;
        else row.failed++;
        row.duration_ms = bounded(row.duration_ms + Date.now() - tool.at);
        this.active.delete(event.toolCallId);
      }
    }
    if (event.type === "text.final")
      for (const model of event.model?.modelsUsed ?? []) {
        if (["super", "ultra"].includes(model)) this.models.add(model);
      }
  }
  snapshot() {
    return {
      duration_ms: bounded(Date.now() - this.started),
      first_output_ms: this.firstOutput,
      tools: this.tools,
      models: [...this.models],
    };
  }
  async persist(userId: string, runId: string, status: string) {
    if (process.env.PRODUCT_TELEMETRY_ENABLED !== "true") return;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY,
      url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!key || !url) {
      console.warn("telemetry.ai_measurements_not_configured");
      return;
    }
    const snapshot = this.snapshot();
    try {
      const client = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: (input, init) =>
            fetch(input, { ...init, signal: AbortSignal.timeout(2000) }),
        },
      });
      const { error } = await client.rpc("telemetry_record_ai_run", {
        p_run: runId,
        p_user: userId,
        p_status: status,
        p_duration: snapshot.duration_ms,
        p_first_output: snapshot.first_output_ms,
        p_tools: snapshot.tools,
        p_models: snapshot.models,
      });
      if (error) console.warn("telemetry.ai_measurements_write_failed");
    } catch {
      console.warn("telemetry.ai_measurements_write_failed");
    }
  }
}
