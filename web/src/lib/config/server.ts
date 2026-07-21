import "server-only";

export function isE2EAuthBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.E2E_BYPASS_AUTH === "1"
  );
}
