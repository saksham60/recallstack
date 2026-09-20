import "server-only";

export const RUN_LEASE_TIMEOUT_MS = 120_000;
export const RUN_HEARTBEAT_INTERVAL_MS = 12_000;
export const RUN_LEASE_EXPIRED_CODE = "RUN_LEASE_EXPIRED";

export function isRunLeaseExpired(heartbeatAt: string, now = Date.now()): boolean {
  const timestamp = Date.parse(heartbeatAt);
  return !Number.isFinite(timestamp) || now - timestamp >= RUN_LEASE_TIMEOUT_MS;
}
