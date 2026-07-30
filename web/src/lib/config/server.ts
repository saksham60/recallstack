import "server-only";

export function isE2EAuthBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.E2E_BYPASS_AUTH === "1"
  );
}

export function isSystemDesignAdminEnabled(): boolean {
  return process.env.SYSTEM_DESIGN_ADMIN_ENABLED === "1";
}
