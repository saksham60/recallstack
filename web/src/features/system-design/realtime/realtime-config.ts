const REALTIME_ENV_NAME = "NEXT_PUBLIC_REALTIME_BASE_URL";

export function getRealtimeBaseUrl(): URL {
  const value = process.env.NEXT_PUBLIC_REALTIME_BASE_URL?.trim();
  if (!value) {
    throw new Error(`Missing ${REALTIME_ENV_NAME} environment variable.`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${REALTIME_ENV_NAME} must be a valid HTTP URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${REALTIME_ENV_NAME} must use HTTP or HTTPS.`);
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url;
}

export function createRealtimeWebSocketUrl(
  roomToken: string,
  actorId: string,
  lastSequence: number,
): string {
  const url = getRealtimeBaseUrl();
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const basePath = url.pathname === "/" ? "" : url.pathname;
  url.pathname = `${basePath}/v1/rooms/${encodeURIComponent(roomToken)}/ws`;
  url.searchParams.set("actorId", actorId);
  if (lastSequence > 0) {
    url.searchParams.set("lastSequence", String(lastSequence));
  }
  return url.toString();
}
