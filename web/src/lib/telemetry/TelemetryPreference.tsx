"use client";
import { useSyncExternalStore } from "react";
import { setTelemetryPreference, telemetryPreference } from "./client";

const subscribe = (notify: () => void) => {
  window.addEventListener("telemetry-preference", notify);
  return () => window.removeEventListener("telemetry-preference", notify);
};
export function TelemetryPreference() {
  const value = useSyncExternalStore(
    subscribe,
    telemetryPreference,
    () => true,
  );
  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="font-semibold">Product analytics</h2>
      <p className="mt-2 text-sm text-muted">
        When enabled for this release, ReasonAI records bounded feature usage
        and diagnostics to improve the product. Prompts, code, diagrams and
        private content are excluded. Browser privacy signals are respected.
        Turning this off stops optional collection on this browser; business
        records remain necessary for product features.
      </p>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => {
            setTelemetryPreference(e.target.checked);
            window.dispatchEvent(new Event("telemetry-preference"));
          }}
        />
        Allow optional product analytics on this browser
      </label>
    </section>
  );
}
