import "server-only";

export function getTavilyConfiguration() {
  return { apiKey: process.env.TAVILY_API_KEY };
}

export function getReasonAIConfiguration() {
  return {
    apiKey: process.env.NEBIUS_API_KEY,
    model: process.env.REASONAI_MODEL || "nvidia/nemotron-3-super-120b-a12b",
    baseUrl: process.env.REASONAI_BASE_URL || "https://api.tokenfactory.nebius.com/v1",
  };
}

export function isReasonAIDSAStreamingEnabled(): boolean {
  const mode = process.env.REASONAI_V2_MODE?.trim().toLowerCase() ?? "off";
  return mode === "dsa" || mode === "all";
}

export type ReasonAIMemoryMode = "off" | "dsa" | "all";

export function getReasonAIMemoryMode(): ReasonAIMemoryMode {
  const mode = process.env.REASONAI_MEMORY_MODE?.trim().toLowerCase();
  return mode === "dsa" || mode === "all" ? mode : "off";
}

export function isReasonAILearnerMemoryEnabled(surface: "dsa" | "system_design"): boolean {
  const mode = getReasonAIMemoryMode();
  return mode === "all" || mode === surface;
}

export function isE2EAuthBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.E2E_BYPASS_AUTH === "1"
  );
}

export function isSystemDesignEnabled(): boolean {
  return (
    process.env.SYSTEM_DESIGN_ENABLED ??
    process.env.SYSTEM_DESIGN_ADMIN_ENABLED
  ) === "1";
}
