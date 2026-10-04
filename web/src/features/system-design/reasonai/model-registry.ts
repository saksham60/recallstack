import "server-only";

import type { ReasonAIModelPreference, ReasonAIModelTier } from "./contract";

// Provider IDs are server-owned. Client requests contain only friendly tiers.
export const SYSTEM_DESIGN_MODELS: Readonly<Record<ReasonAIModelTier, string>> = {
  lightning: "nvidia/Nemotron-3_5-Lightning",
  super: "nvidia/nemotron-3-super-120b-a12b",
  ultra: "nvidia/Nemotron-3-Ultra-550b-a55b",
};

export function initialSystemDesignTier(preference: ReasonAIModelPreference = "auto"): ReasonAIModelTier {
  return preference === "auto" ? "super" : preference;
}
