"use client";

import { acknowledgeAcquisition, clearAcquisition, pendingAcquisition } from "./acquisition";
import { telemetryCollectionPermitted } from "./privacy";
export { telemetryCollectionPermitted, telemetryPreference } from "./privacy";
import { publicConfig } from "../config/public";
import { registry, type EventName, type EventProperties } from "./registry";

type WireEvent = {
  event_id: string;
  schema_version: 1;
  event_name: EventName;
  session_id: string;
  journey_id: string;
  occurred_at: string;
  source: "web";
  entity_id?: string;
  properties: object;
  correlation_id?: string;
};
const MAX_BUFFER = 200,
  MAX_BYTES = 128 * 1024,
  IDLE_MS = 30 * 60 * 1000;
const configuredVersion = process.env.NEXT_PUBLIC_APP_VERSION;
const appVersion =
  configuredVersion && /^[a-zA-Z0-9_.-]{1,80}$/.test(configuredVersion)
    ? configuredVersion
    : "Unknown";
let owner: string | undefined,
  token: string | undefined,
  queue: WireEvent[] = [];
let session = "",
  journey = "",
  lastAction = 0,
  busy = false,
  failures = 0;
let enabled = false,
  timer: ReturnType<typeof setTimeout> | undefined;
let reportedDropped = 0,
  reportedRetries = 0;
export const telemetryDelivery = { accepted: 0, retries: 0, dropped: 0 };
const key = () => `reasonai:telemetry:1:${owner}`;

function validProperties(name: EventName, properties: object): boolean {
  if (
    !Object.hasOwn(registry, name) ||
    !properties ||
    Array.isArray(properties)
  )
    return false;
  const allowed: Record<string, string | readonly string[]> =
    registry[name].properties;
  return Object.entries(properties).every(([key, value]) => {
    if (!Object.hasOwn(allowed, key)) return false;
    const kind = allowed[key];
    if (!kind) return false;
    if (Array.isArray(kind))
      return typeof value === "string" && kind.includes(value);
    if (["count", "duration", "active"].includes(kind as string))
      return (
        Number.isInteger(value) &&
        value >= 0 &&
        value <= (kind === "active" ? 30 : kind === "duration" ? 600000 : 10000)
      );
    if (kind === "bool") return typeof value === "boolean";
    return (
      typeof value === "string" &&
      !(kind === "host" && /^\d{1,3}(\.\d{1,3}){3}$/.test(value)) &&
      (kind === "host"
        ? /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/
        : /^[a-zA-Z0-9_.-]{1,80}$/
      ).test(value)
    );
  });
}

function persist() {
  try {
    sessionStorage.setItem(key(), JSON.stringify(queue));
  } catch {
    /* Bounded memory remains available. */
  }
}
function schedule(delay = 5000) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    void flushTelemetry();
  }, delay);
}
function append<N extends EventName>(
  name: N,
  properties: EventProperties[N],
  entityId?: string,
  correlationId?: string,
  eventId?: string,
) {
  if (!validProperties(name, properties)) {
    telemetryDelivery.dropped++;
    return;
  }
  const event: WireEvent = {
    event_id: eventId ?? crypto.randomUUID(),
    schema_version: 1,
    event_name: name,
    session_id: session,
    journey_id: journey,
    occurred_at: new Date().toISOString(),
    source: "web",
    ...(entityId && /^[0-9a-f-]{36}$/i.test(entityId)
      ? { entity_id: entityId }
      : {}),
    ...(correlationId && /^[0-9a-f-]{36}$/i.test(correlationId)
      ? { correlation_id: correlationId }
      : {}),
    properties,
  };
  if (JSON.stringify(event).length > 2048) {
    telemetryDelivery.dropped++;
    return;
  }
  while (
    queue.length >= MAX_BUFFER ||
    JSON.stringify(queue).length > MAX_BYTES - 2048
  ) {
    const disposable = queue.findIndex((event) => event.event_name !== "acquisition.first_touch");
    queue.splice(disposable < 0 ? 0 : disposable, 1);
    telemetryDelivery.dropped++;
  }
  queue.push(event);
  persist();
  schedule();
}
export function setTelemetryPreference(value: boolean) {
  try {
    localStorage.setItem("reasonai:telemetry:preference", value ? "on" : "off");
  } catch {
    /* Restricted storage. */
  }
  enabled = telemetryCollectionPermitted() && value;
  if (!enabled) {
    queue = [];
    persist();
    clearTimeout(timer);
    timer = undefined;
    try {
      clearAcquisition();
    } catch {
      /* Restricted storage. */
    }
  }
  if (enabled && owner && !session) {
    session = crypto.randomUUID();
    journey = crypto.randomUUID();
    lastAction = Date.now();
    append("session.started", {
      app_version: appVersion,
      os_family: "web",
      device_class: "unknown",
    });
  }
}
export function setTelemetryIdentity(id?: string, accessToken?: string, createdAt?: string, signedInAt?: string) {
  try {
    if (owner !== id) {
      clearTimeout(timer);
      timer = undefined;
      queue = [];
      owner = id;
      session = "";
      journey = "";
      failures = 0;
      if (id) {
        const saved = JSON.parse(
          sessionStorage.getItem(key()) ?? "[]",
        ) as WireEvent[];
        // Revalidate storage before sending: never buffer arbitrary unknown data.
        if (
          Array.isArray(saved) &&
          saved.length <= MAX_BUFFER &&
          JSON.stringify(saved).length <= MAX_BYTES
        )
          queue = saved.filter(
            (e) =>
              Object.keys(e).every((k) =>
                [
                  "event_id",
                  "schema_version",
                  "event_name",
                  "session_id",
                  "journey_id",
                  "occurred_at",
                  "source",
                  "entity_id",
                  "properties",
                  "correlation_id",
                ].includes(k),
              ) &&
              e.schema_version === 1 &&
              e.source === "web" &&
              Object.hasOwn(registry, e.event_name) &&
              validProperties(e.event_name, e.properties) &&
              Date.parse(e.occurred_at) > Date.now() - 7 * 86400000 &&
              JSON.stringify(e).length <= 2048,
          );
      }
    }
    token = accessToken;
    enabled = telemetryCollectionPermitted();
    if (enabled && id && accessToken && !session) {
      session = crypto.randomUUID();
      journey = crypto.randomUUID();
      lastAction = Date.now();
      append("session.started", {
        app_version: appVersion,
        os_family: "web",
        device_class: "unknown",
      });
    }
    if (enabled && id && accessToken) {
      const acquisition = pendingAcquisition(id, createdAt, signedInAt);
      if (acquisition && !queue.some((event) => event.event_id === acquisition.eventId))
        append("acquisition.first_touch", acquisition.properties, undefined, undefined, acquisition.eventId);
      // Restored queues must flush even when no new navigation event is emitted.
      if (queue.length) schedule();
    }
  } catch {
    /* Noncritical telemetry must not break authentication. */
  }
}
export function track<N extends EventName>(
  name: N,
  properties: EventProperties[N] = {} as EventProperties[N],
  entityId?: string,
  correlationId?: string,
) {
  try {
    if (!enabled || !owner || !token || !telemetryCollectionPermitted()) return;
    if (Date.now() - lastAction > IDLE_MS) {
      session = crypto.randomUUID();
      journey = crypto.randomUUID();
      append("session.started", {
        app_version: appVersion,
        os_family: "web",
        device_class: "unknown",
      });
    }
    // Active pulses do not reset inactivity. Only navigation and meaningful actions do.
    if (name !== "session.active") lastAction = Date.now();
    append(name, properties, entityId, correlationId);
  } catch {
    telemetryDelivery.dropped++;
  }
}
export function beginJourney() {
  try {
    journey = crypto.randomUUID();
  } catch {
    /* No crypto. */
  }
}
export function activeTelemetryPulse(seconds: number) {
  if (document.visibilityState === "visible" && Date.now() - lastAction < 60000)
    track("session.active", {
      active_seconds: Math.max(0, Math.min(30, Math.floor(seconds))),
    });
}
export async function flushTelemetry(keepalive = false): Promise<void> {
  if (!telemetryCollectionPermitted()) {
    queue = [];
    persist();
    return;
  }
  if (busy || !enabled || !owner || !token || !queue.length) return;
  busy = true;
  const sendingOwner = owner,
    batch = queue.slice(0, 30);
  try {
    const response = await fetch(
      `${publicConfig.apiBaseUrl.replace(/\/$/, "")}/api/v1/telemetry/events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ events: batch }),
        keepalive,
        signal: AbortSignal.timeout(10000),
      },
    );
    if (sendingOwner !== owner) return;
    if (response.ok) {
      for (const event of batch)
        if (event.event_name === "acquisition.first_touch")
          acknowledgeAcquisition(sendingOwner, event.event_id);
      const sent = new Set(batch.map((e) => e.event_id));
      queue = queue.filter((e) => !sent.has(e.event_id));
      telemetryDelivery.accepted += batch.length;
      failures = 0;
      persist();
      if (
        telemetryDelivery.dropped > reportedDropped ||
        telemetryDelivery.retries > reportedRetries
      ) {
        const count = Math.min(
          10000,
          telemetryDelivery.dropped - reportedDropped,
        );
        const retryCount = Math.min(
          10000,
          telemetryDelivery.retries - reportedRetries,
        );
        reportedDropped = telemetryDelivery.dropped;
        reportedRetries = telemetryDelivery.retries;
        append("diagnostics.delivery", {
          category: "delivery",
          count,
          retry_count: retryCount,
        });
      }
    } else if ([400, 413, 422].includes(response.status)) {
      queue.splice(0, batch.length);
      telemetryDelivery.dropped += batch.length;
      persist();
    } else throw new Error("Delivery unavailable");
  } catch {
    if (sendingOwner === owner) {
      failures++;
      telemetryDelivery.retries++;
      if (failures >= 5) {
        // Keep the one first-touch event retryable with its original UUID.
        // Other optional events retain the existing bounded retry policy.
        const dropped = new Set(batch.filter((event) => event.event_name !== "acquisition.first_touch").map((event) => event.event_id));
        queue = queue.filter((event) => !dropped.has(event.event_id));
        telemetryDelivery.dropped += dropped.size;
        failures = 0;
        persist();
      }
    }
  } finally {
    busy = false;
    if (queue.length) schedule(Math.min(60000, 5000 * 2 ** failures));
  }
}
