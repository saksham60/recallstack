export function telemetryPreference(): boolean {
  try {
    return localStorage.getItem("reasonai:telemetry:preference") !== "off";
  } catch {
    return true;
  }
}

export function telemetryCollectionPermitted(): boolean {
  return (
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_PRODUCT_TELEMETRY_ENABLED === "true" &&
    navigator.doNotTrack !== "1" &&
    !(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl &&
    telemetryPreference()
  );
}
