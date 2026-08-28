import { expect, test as base, type Page } from "@playwright/test";
import { test as authenticatedTest } from "./fixtures/authenticated-test";
import { createProfile } from "./helpers/factories";
import {
  SYSTEM_DESIGN_SCHEMA_VERSION,
  type SystemDesignDocument,
} from "../src/features/system-design/types/system-design.types";

const ROOM_TOKEN = "room_token_for_browser_test_123456789";

function createSharedDocument(title = "Shared Canvas"): SystemDesignDocument {
  const diagramId = "shared-root";
  return {
    schemaVersion: SYSTEM_DESIGN_SCHEMA_VERSION,
    id: "shared-document",
    title,
    status: "in_progress",
    rootDiagramId: diagramId,
    diagrams: {
      [diagramId]: {
        id: diagramId,
        name: title,
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    },
    createdAt: "2026-08-27T08:00:00.000Z",
    updatedAt: "2026-08-27T08:00:00.000Z",
  };
}

async function installRealtimeSocket(
  page: Page,
  options: { mode: "full" | "ended"; snapshot: SystemDesignDocument },
) {
  await page.addInitScript(({ mode, snapshot }) => {
    class MockRealtimeWebSocket extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;

      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSING = 2;
      readonly CLOSED = 3;
      readonly url: string;
      readonly protocol = "";
      readonly extensions = "";
      bufferedAmount = 0;
      binaryType: BinaryType = "blob";
      readyState = MockRealtimeWebSocket.CONNECTING;
      onopen: ((this: WebSocket, event: Event) => unknown) | null = null;
      onmessage: ((this: WebSocket, event: MessageEvent) => unknown) | null =
        null;
      onerror: ((this: WebSocket, event: Event) => unknown) | null = null;
      onclose: ((this: WebSocket, event: CloseEvent) => unknown) | null = null;

      constructor(url: string | URL) {
        super();
        this.url = String(url);
        window.setTimeout(() => {
          this.readyState = MockRealtimeWebSocket.OPEN;
          this.onopen?.call(this as unknown as WebSocket, new Event("open"));
          if (mode === "ended") {
            window.setTimeout(() => {
              this.readyState = MockRealtimeWebSocket.CLOSED;
              this.onclose?.call(
                this as unknown as WebSocket,
                new CloseEvent("close", {
                  code: 4408,
                  reason: "room expired",
                  wasClean: true,
                }),
              );
            }, 1_000);
            return;
          }
          this.onmessage?.call(
            this as unknown as WebSocket,
            new MessageEvent("message", {
              data: JSON.stringify({
                v: 1,
                type: "room.state",
                stateMode: "full",
                snapshot,
                historyStartsAt: 1,
              }),
            }),
          );
        }, 25);
      }

      send(): void {}

      close(): void {
        this.readyState = MockRealtimeWebSocket.CLOSED;
      }
    }

    const realtimeAwareWebSocket = new Proxy(window.WebSocket, {
      construct(NativeWebSocket, args) {
        const url = String(args[0]);
        if (!url.startsWith("ws://realtime.test/")) {
          return Reflect.construct(NativeWebSocket, args);
        }
        return new MockRealtimeWebSocket(url);
      },
    });
    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      value: realtimeAwareWebSocket,
    });
  }, options);
}

authenticatedTest(
  "starts Live Share immediately and exposes the capability link",
  async ({ authenticatedPage: page }) => {
    const snapshot = createSharedDocument("Canvas");
    await page.context().grantPermissions(
      ["clipboard-read", "clipboard-write"],
      { origin: "http://localhost:3000" },
    );
    await installRealtimeSocket(page, { mode: "full", snapshot });
    await page.route("**/api/v1/me", (route) =>
      route.fulfill({ json: createProfile({ roles: ["admin"] }) }),
    );
    let releaseCreateRoom = () => {};
    const createRoomGate = new Promise<void>((resolve) => {
      releaseCreateRoom = resolve;
    });
    await page.route("http://realtime.test/v1/rooms", async (route) => {
      await createRoomGate;
      await route.fulfill({
        json: {
          roomId: "room-browser-test",
          roomToken: ROOM_TOKEN,
          expiresAt: "2026-08-28T08:00:00.000Z",
          maxParticipants: 2,
          websocketPath: `/v1/rooms/${ROOM_TOKEN}/ws`,
        },
      });
    });

    await page.goto("/system-design/canvas");
    await expect(page.getByTestId("system-design-canvas")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Live Share" }).click();
    await expect(
      page.getByRole("heading", { name: /Starting live session/ }),
    ).toBeVisible();

    releaseCreateRoom();
    await expect(page.getByLabel("Share link")).toHaveValue(
      new RegExp(`/system-design/live/${ROOM_TOKEN}$`),
    );
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(`http://localhost:3000/system-design/live/${ROOM_TOKEN}`);
    await expect(
      page.getByRole("button", { name: "Open live session sharing" }),
    ).toContainText("Live");
  },
);

base("loads the public guest canvas from a full room state", async ({ page }) => {
  const forbiddenBackendRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.pathname.startsWith("/api/v1/") ||
      url.pathname.startsWith("/auth/v1/")
    ) {
      forbiddenBackendRequests.push(url.pathname);
    }
  });
  await installRealtimeSocket(page, {
    mode: "full",
    snapshot: createSharedDocument(),
  });
  await page.goto(`/system-design/live/${ROOM_TOKEN}`);

  await expect(page.getByTestId("system-design-canvas")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTitle("Shared Canvas")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open live session sharing" }),
  ).toContainText("Live");
  expect(forbiddenBackendRequests).toEqual([]);
});

base("shows a safe terminal state when a guest room has ended", async ({
  page,
}) => {
  await installRealtimeSocket(page, {
    mode: "ended",
    snapshot: createSharedDocument(),
  });
  await page.goto(`/system-design/live/${ROOM_TOKEN}`);

  await expect(
    page.getByRole("heading", { name: /Joining live session/ }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "This live session has ended" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
});
