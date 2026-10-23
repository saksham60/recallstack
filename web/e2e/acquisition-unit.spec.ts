import { test, expect } from "@playwright/test";
import { captureFirstTouch, pendingAcquisition, acknowledgeAcquisition } from "../src/lib/telemetry/acquisition";

const first = "reasonai:first-touch:1";
const campaign = "https://reasonai.test/?utm_source=devpost&utm_medium=referral&utm_campaign=hackathon";
const owner = "00000000-0000-4000-8000-000000000042";
let client: typeof import("../src/lib/telemetry/client");
let sent: Array<{ events: Array<{ event_id: string; event_name: string; properties: object }> }>;

function storage() {
  const entries = new Map<string, string>();
  return new Proxy({ getItem: (k: string) => entries.get(k) ?? null, setItem: (k: string, v: string) => { entries.set(k, v); }, removeItem: (k: string) => { entries.delete(k); } }, {
    ownKeys: () => [...entries.keys()],
    getOwnPropertyDescriptor: (target, property) => Reflect.getOwnPropertyDescriptor(target, property) ?? { configurable: true, enumerable: true, writable: true, value: entries.get(String(property)) },
  });
}
function land(url: string, referrer = "") {
  Object.defineProperty(globalThis, "location", { configurable: true, value: new URL(url) });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { referrer } });
  captureFirstTouch();
}

test.beforeAll(async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:4170";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-public-key";
  client = await import("../src/lib/telemetry/client");
});
test.beforeEach(() => {
  client.setTelemetryIdentity();
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage() });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage() });
  process.env.NEXT_PUBLIC_PRODUCT_TELEMETRY_ENABLED = "true";
  sent = [];
  globalThis.fetch = async (_url, init) => { sent.push(JSON.parse(String(init?.body))); return new Response('{"accepted":1,"duplicates":0}', { status: 200 }); };
});
test.afterEach(() => client.setTelemetryIdentity());

test("empty legacy capture upgrades to validated campaign and ignores private query parameters", () => {
  sessionStorage.setItem(first, JSON.stringify({ landing: "home", referrer_host: "reasonai.test" }));
  land(campaign + "&email=private@example.test&token=secret");
  expect(JSON.parse(sessionStorage.getItem(first)!)).toEqual({ landing: "home", utm_source: "devpost", utm_medium: "referral", utm_campaign: "hackathon" });
});

test("valid first touch is immutable; later campaign stays separate", () => {
  land(campaign);
  land("https://reasonai.test/?utm_source=youtube&utm_medium=video&utm_campaign=demo");
  expect(JSON.parse(sessionStorage.getItem(first)!)).toMatchObject({ utm_source: "devpost", utm_campaign: "hackathon" });
  expect(JSON.parse(sessionStorage.getItem("reasonai:later-touch:1")!)).toMatchObject({ utm_source: "youtube" });
});

test("organic first touch remains immutable when a later tagged campaign arrives", () => {
  land("https://reasonai.test/", "https://www.google.com/search?q=private");
  land(campaign);
  expect(JSON.parse(sessionStorage.getItem(first)!)).toEqual({ landing: "home", referrer_host: "www.google.com" });
});

test("login, OAuth callback, refresh and same-site navigation preserve original campaign", () => {
  land(campaign);
  for (const url of ["/login", "/auth/callback?code=private", "/feed", "/feed"])
    land("https://reasonai.test" + url, "https://accounts.google.com/");
  expect(JSON.parse(sessionStorage.getItem(first)!)).toMatchObject({ utm_source: "devpost", utm_medium: "referral", utm_campaign: "hackathon" });
  expect(sessionStorage.getItem("reasonai:later-touch:1")).toBeNull();
});

test("corrupt capture and malformed referrer do not suppress valid UTM tags", () => {
  sessionStorage.setItem(first, "{broken");
  land(campaign, "not a URL");
  expect(JSON.parse(sessionStorage.getItem(first)!)).toMatchObject({ utm_source: "devpost" });
});

test("invalid tags, raw IP referrers and Google sign-in are not acquisition sources", () => {
  land("https://reasonai.test/?utm_source=bad%20source&utm_campaign=" + "a".repeat(81), "https://192.168.1.1/");
  expect(JSON.parse(sessionStorage.getItem(first)!)).toEqual({ landing: "home" });
  land("https://reasonai.test/feed", "https://accounts.google.com/");
  expect(JSON.parse(sessionStorage.getItem(first)!)).toEqual({ landing: "home" });
});

for (const gate of ["flag", "dnt", "gpc", "preference", "storage"] as const) {
  test(`privacy gate ${gate} prevents capture`, () => {
    if (gate === "flag") process.env.NEXT_PUBLIC_PRODUCT_TELEMETRY_ENABLED = "false";
    if (gate === "dnt") Object.assign(navigator, { doNotTrack: "1" });
    if (gate === "gpc") Object.assign(navigator, { globalPrivacyControl: true });
    if (gate === "preference") localStorage.setItem("reasonai:telemetry:preference", "off");
    if (gate === "storage") sessionStorage.setItem = () => { throw new Error("Storage blocked"); };
    expect(() => land(campaign)).not.toThrow();
    expect(sessionStorage.getItem(first)).toBeNull();
  });
}

test("stable delivery identity survives repeated auth callbacks; acknowledgement suppresses later logins", () => {
  land(campaign);
  const created = new Date().toISOString();
  const pending = pendingAcquisition(owner, created)!;
  expect(pendingAcquisition(owner, created)?.eventId).toBe(pending.eventId);
  acknowledgeAcquisition(owner, crypto.randomUUID());
  expect(pendingAcquisition(owner, created)).toBeDefined();
  acknowledgeAcquisition(owner, pending.eventId);
  expect(pendingAcquisition(owner, created)).toBeUndefined();
  expect(pendingAcquisition("another-account", created)).toBeDefined();
});

test("existing accounts are ineligible and cannot acquire a new signup source", () => {
  land(campaign);
  expect(pendingAcquisition(owner, new Date(Date.now() - 2 * 86400000).toISOString(), new Date().toISOString())).toBeUndefined();
  expect(pendingAcquisition(owner, "invalid")).toBeUndefined();
});

test("browser clock behind Supabase does not discard a newly created account", () => {
  land(campaign);
  expect(pendingAcquisition(owner, new Date(Date.now() + 60000).toISOString())).toBeDefined();
});

test("provider signup timestamps remain eligible even with a browser clock days ahead", () => {
  land(campaign);
  const providerTime = new Date().toISOString();
  const now = Date.now;
  try {
    Date.now = () => now() + 3 * 86400000;
    expect(pendingAcquisition(owner, providerTime, providerTime)).toBeDefined();
  } finally { Date.now = now; }
});

test("opting out clears pending campaign metadata and does not replay it after re-enabling", async () => {
  land(campaign);
  client.setTelemetryIdentity(owner, "fixture-token", new Date().toISOString());
  client.setTelemetryPreference(false);
  expect(sessionStorage.getItem(first)).toBeNull();
  expect(sessionStorage.getItem(`reasonai:acquisition:1:${owner}`)).toBeNull();
  client.setTelemetryPreference(true);
  client.setTelemetryIdentity(owner, "fixture-token", new Date().toISOString());
  await client.flushTelemetry();
  expect(sent.flatMap(batch => batch.events).some(event => event.event_name === "acquisition.first_touch")).toBe(false);
});

test("refreshing a tagged landing does not manufacture a later touch", () => {
  land(campaign, "https://devpost.com/");
  land(campaign, "https://reasonai.test/");
  expect(sessionStorage.getItem("reasonai:later-touch:1")).toBeNull();
});

test("buffer pressure preserves first touch while optional events are dropped", async () => {
  land(campaign);
  client.setTelemetryIdentity(owner, "fixture-token", new Date().toISOString());
  for (let index = 0; index < 250; index++) client.track("feed.opened");
  await client.flushTelemetry();
  expect(sent[0].events.some(event => event.event_name === "acquisition.first_touch")).toBe(true);
});

test("no acquisition is sent until a complete authenticated session exists", async () => {
  land(campaign);
  client.setTelemetryIdentity(owner, undefined, new Date().toISOString());
  await client.flushTelemetry();
  expect(sent).toHaveLength(0);
  client.setTelemetryIdentity(owner, "fixture-token", new Date().toISOString());
  await client.flushTelemetry();
  expect(sent.flatMap(batch => batch.events).filter(event => event.event_name === "acquisition.first_touch")).toHaveLength(1);
});

test("lost acknowledgement retries the original event ID, survives queue restoration, and emits once after success", async () => {
  land(campaign);
  const created = new Date().toISOString();
  globalThis.fetch = async (_url, init) => { sent.push(JSON.parse(String(init?.body))); throw new Error("Lost response"); };
  client.setTelemetryIdentity(owner, "fixture-token", created);
  for (let retry = 0; retry < 6; retry++) await client.flushTelemetry();
  const ids = sent.flatMap(batch => batch.events).filter(event => event.event_name === "acquisition.first_touch").map(event => event.event_id);
  expect(new Set(ids).size).toBe(1);
  expect(ids).toHaveLength(6);
  client.setTelemetryIdentity();
  client.setTelemetryIdentity(owner, "new-token", created);
  globalThis.fetch = async (_url, init) => { sent.push(JSON.parse(String(init?.body))); return new Response('{}', { status: 200 }); };
  await client.flushTelemetry();
  expect(sent.at(-1)?.events.find(event => event.event_name === "acquisition.first_touch")?.event_id).toBe(ids[0]);
  sent.length = 0;
  client.setTelemetryIdentity();
  client.setTelemetryIdentity(owner, "login-again", created);
  await client.flushTelemetry();
  expect(sent.flatMap(batch => batch.events).filter(event => event.event_name === "acquisition.first_touch")).toHaveLength(0);
});
