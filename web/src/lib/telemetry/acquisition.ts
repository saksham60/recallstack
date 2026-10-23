import type { EventProperties } from "./registry";
import { telemetryCollectionPermitted } from "./privacy";

type Touch = EventProperties["acquisition.first_touch"];
type Delivery = { eventId: string; delivered: boolean; properties: Touch };
const FIRST_TOUCH = "reasonai:first-touch:1";
const LATER_TOUCH = "reasonai:later-touch:1";
const deliveryKey = (owner: string) => `reasonai:acquisition:1:${owner}`;
const tagPattern = /^[a-zA-Z0-9_.-]{1,80}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function externalHost(value: string): boolean {
  const host = value.toLowerCase();
  return (
    /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(host) &&
    !/^\d{1,3}(\.\d{1,3}){3}$/.test(host) &&
    host !== "accounts.google.com" &&
    host !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || location.origin).hostname &&
    host.replace(/^www\./, "") !== location.hostname.replace(/^www\./, "")
  );
}

function validatedTouch(value: unknown): Touch {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const result: Touch = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "referral_code"] as const) {
    if (typeof input[key] === "string" && tagPattern.test(input[key])) result[key] = input[key];
  }
  if (typeof input.referrer_host === "string" && externalHost(input.referrer_host))
    result.referrer_host = input.referrer_host;
  if (["home", "feed", "dsa", "system_design", "other"].includes(String(input.landing)))
    result.landing = input.landing as Touch["landing"];
  return result;
}

function readTouch(): Touch {
  try {
    return validatedTouch(JSON.parse(sessionStorage.getItem(FIRST_TOUCH) ?? "null"));
  } catch {
    return {};
  }
}

function hasSource(touch: Touch): boolean {
  return Boolean(touch.utm_source || touch.referrer_host || touch.referral_code);
}

/** Synchronous: called before hydration, with a route fallback before identity setup. */
export function captureFirstTouch(href = location.href): void {
  try {
    if (!telemetryCollectionPermitted()) return;
    const url = new URL(href, location.origin);
    if (url.origin !== location.origin) return;
    const touch: Touch = {};
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "referral_code"] as const) {
      const value = url.searchParams.get(key);
      if (value && tagPattern.test(value)) touch[key] = value;
    }
    // Authentication redirects are transport, never acquisition from Google login.
    if (/^\/(auth|login)(\/|$)/.test(url.pathname) && !hasSource(touch)) return;
    touch.landing = url.pathname === "/" ? "home"
      : url.pathname.startsWith("/feed") ? "feed"
      : url.pathname.startsWith("/dsa") ? "dsa"
      : url.pathname.startsWith("/system-design") ? "system_design" : "other";
    if (document.referrer) {
      try {
        const host = new URL(document.referrer).hostname;
        if (externalHost(host)) touch.referrer_host = host;
      } catch { /* Invalid referrers must not discard valid campaign tags. */ }
    }
    const existing = readTouch();
    if (hasSource(existing)) {
      // Keep a later observed source separate; it never replaces signup attribution.
      const source = (value: Touch) => value.utm_source || value.referrer_host || value.referral_code;
      if (hasSource(touch) && (source(touch) !== source(existing) ||
        ["utm_medium", "utm_campaign", "referral_code"].some(key =>
          touch[key as keyof Touch] !== existing[key as keyof Touch])))
        sessionStorage.setItem(LATER_TOUCH, JSON.stringify(touch));
      return;
    }
    if (hasSource(touch) || !sessionStorage.getItem(FIRST_TOUCH))
      sessionStorage.setItem(FIRST_TOUCH, JSON.stringify(touch));
  } catch { /* Storage/privacy failures must never block navigation or login. */ }
}

/** Client eligibility is a hint; the server verifies canonical profile creation. */
export function pendingAcquisition(owner: string, createdAt?: string, signedInAt?: string): Delivery | undefined {
  try {
    if (!telemetryCollectionPermitted()) return;
    const created = createdAt === undefined ? undefined : Date.parse(createdAt);
    // Compare two provider timestamps, never the visitor's wall clock. Without
    // a complete hint, let the API enforce canonical profile eligibility.
    const signedIn = signedInAt === undefined ? undefined : Date.parse(signedInAt);
    if (created !== undefined && !Number.isFinite(created)) return;
    if (created !== undefined && signedIn !== undefined && Number.isFinite(signedIn) && signedIn - created > 86400000) return;
    const saved = JSON.parse(sessionStorage.getItem(deliveryKey(owner)) ?? "null") as Delivery | null;
    if (saved && uuidPattern.test(saved.eventId)) {
      return saved.delivered ? undefined : { ...saved, properties: validatedTouch(saved.properties) };
    }
    const properties = readTouch();
    if (!Object.keys(properties).length) return;
    const delivery = { eventId: crypto.randomUUID(), delivered: false, properties };
    sessionStorage.setItem(deliveryKey(owner), JSON.stringify(delivery));
    return delivery;
  } catch { return; }
}

export function acknowledgeAcquisition(owner: string, eventId: string): void {
  try {
    const saved = JSON.parse(sessionStorage.getItem(deliveryKey(owner)) ?? "null") as Delivery | null;
    if (saved?.eventId === eventId)
      sessionStorage.setItem(deliveryKey(owner), JSON.stringify({ ...saved, delivered: true }));
  } catch { /* Server event IDs and acquisition uniqueness remain authoritative. */ }
}

export function clearAcquisition(): void {
  try {
    sessionStorage.removeItem(FIRST_TOUCH);
    sessionStorage.removeItem(LATER_TOUCH);
    for (const key of Object.keys(sessionStorage)) {
      if (!key.startsWith("reasonai:acquisition:1:")) continue;
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null") as Delivery | null;
      if (!saved?.delivered) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify({ ...saved, properties: {} }));
    }
  } catch { /* Restricted storage. */ }
}
