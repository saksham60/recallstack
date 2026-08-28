import { expect, test as base, type Page } from "@playwright/test";
import { test as authenticatedTest } from "./fixtures/authenticated-test";
import { createProfile } from "./helpers/factories";
import {
  SYSTEM_DESIGN_SCHEMA_VERSION,
  type SystemDesignDocument,
} from "../src/features/system-design/types/system-design.types";

const ROOM_TOKEN = "room_token_for_browser_test_123456789";

interface RealtimeTestWindow extends Window {
  __emitRealtimeMessage?: (message: unknown) => void;
  __sentRealtimeMessages?: string[];
}

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
    const sockets: MockRealtimeWebSocket[] = [];
    const sentMessages: string[] = [];
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
        sockets.push(this);
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

      send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        if (typeof data === "string") sentMessages.push(data);
      }

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
    const testWindow = window as unknown as RealtimeTestWindow;
    testWindow.__sentRealtimeMessages = sentMessages;
    testWindow.__emitRealtimeMessage = (message) => {
      sockets.forEach((socket) => {
        if (socket.readyState !== MockRealtimeWebSocket.OPEN) return;
        socket.onmessage?.call(
          socket as unknown as WebSocket,
          new MessageEvent("message", { data: JSON.stringify(message) }),
        );
      });
    };
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

base("applies remote structural edits and shows presence with a local QR code", async ({
  page,
}) => {
  const snapshot = createSharedDocument("Phase 2 Canvas");
  await installRealtimeSocket(page, { mode: "full", snapshot });
  await page.goto(`/system-design/live/${ROOM_TOKEN}`);
  const canvas = page.getByTestId("system-design-canvas");
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;

  await page.evaluate(({ diagramId }) => {
    const emit = (window as unknown as RealtimeTestWindow).__emitRealtimeMessage;
    emit?.({
      v: 1,
      type: "presence",
      actorId: "remote-phase-two",
      payload: {
        displayName: "Guest Tablet",
        viewingDiagramId: diagramId,
        cursor: { diagramId, x: 420, y: 180 },
      },
    });
    emit?.({
      v: 1,
      type: "op.commit",
      opId: "remote-add-node",
      actorId: "remote-phase-two",
      sequence: 1,
      payload: {
        kind: "node.add",
        diagramId,
        node: {
          id: "phase-two-node",
          type: "service",
          x: 320,
          y: 160,
          width: 160,
          height: 88,
          label: "Synced service",
          layer: 0,
          locked: false,
          visible: true,
        },
      },
    });
  }, { diagramId: snapshot.rootDiagramId });

  await expect
    .poll(async () => {
      await page.mouse.click(bounds.x + 400, bounds.y + 204);
      return page.getByLabel("Diagram status").textContent();
    })
    .toContain("Selected 1");

  await page.getByRole("button", { name: "Open live session sharing" }).click();
  await expect(page.getByText("Guest Tablet", { exact: true })).toBeVisible();
  await expect(page.getByText(/Participants \(2\)/)).toBeVisible();
  await expect(page.getByLabel("Live session QR code")).toBeVisible();
});

base("renders remote drag previews without committing local editor state", async ({
  page,
}) => {
  const snapshot = createSharedDocument("Remote Drag Canvas");
  const diagramId = snapshot.rootDiagramId;
  snapshot.diagrams[diagramId].nodes = [
    {
      id: "remote-service",
      type: "service",
      x: 72,
      y: 72,
      width: 160,
      height: 88,
      label: "Remote service",
      layer: 0,
      locked: false,
      visible: true,
    },
  ];
  await installRealtimeSocket(page, { mode: "full", snapshot });
  await page.goto(`/system-design/live/${ROOM_TOKEN}`);

  const canvas = page.getByTestId("system-design-canvas");
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "Open live session sharing" }),
  ).toContainText("Live");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;

  await page.evaluate(
    ({ activeDiagramId }) => {
      const emit = (window as unknown as RealtimeTestWindow)
        .__emitRealtimeMessage;
      emit?.({
        v: 1,
        type: "op.ephemeral",
        actorId: "remote-actor",
        payload: {
          kind: "node.drag.start",
          dragSessionId: "remote-drag-1",
          diagramId: activeDiagramId,
          nodeIds: ["remote-service"],
        },
      });
      emit?.({
        v: 1,
        type: "op.ephemeral",
        actorId: "remote-actor",
        payload: {
          kind: "node.drag.preview",
          dragSessionId: "remote-drag-1",
          diagramId: activeDiagramId,
          previewIndex: 1,
          positions: { "remote-service": { x: 340, y: 150 } },
        },
      });
      emit?.({
        v: 1,
        type: "op.ephemeral",
        actorId: "remote-actor",
        payload: {
          kind: "node.drag.preview",
          dragSessionId: "remote-drag-1",
          diagramId: activeDiagramId,
          previewIndex: 2,
          positions: { "remote-service": { x: 420, y: 190 } },
        },
      });
    },
    { activeDiagramId: diagramId },
  );
  await page.waitForTimeout(250);

  await expect
    .poll(async () => {
      await page.mouse.click(bounds.x + 500, bounds.y + 234);
      return page.getByLabel("Diagram status").textContent();
    })
    .toContain("Selected 1");

  const sentBeforeDrag = await page.evaluate(
    () =>
      (window as unknown as RealtimeTestWindow).__sentRealtimeMessages ?? [],
  );
  await page.mouse.move(bounds.x + 500, bounds.y + 234);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 620, bounds.y + 300, { steps: 4 });
  await page.mouse.up();
  const sentAfterDrag = await page.evaluate(
    () =>
      (window as unknown as RealtimeTestWindow).__sentRealtimeMessages ?? [],
  );
  const committedOrEphemeral = (messages: string[]) =>
    messages.filter((message) => JSON.parse(message).type !== "presence");
  expect(committedOrEphemeral(sentAfterDrag)).toEqual(
    committedOrEphemeral(sentBeforeDrag),
  );

  await page.mouse.click(bounds.x + 20, bounds.y + 20);
  await expect(page.getByLabel("Diagram status")).toContainText("Selected 0");
  await page.evaluate(
    ({ activeDiagramId }) => {
      (window as unknown as RealtimeTestWindow).__emitRealtimeMessage?.({
        v: 1,
        type: "op.commit",
        opId: "remote-final-move",
        actorId: "remote-actor",
        sequence: 1,
        payload: {
          kind: "node.move",
          diagramId: activeDiagramId,
          positions: { "remote-service": { x: 520, y: 260 } },
        },
      });
    },
    { activeDiagramId: diagramId },
  );
  await page.waitForTimeout(250);
  await expect
    .poll(async () => {
      await page.mouse.click(bounds.x + 600, bounds.y + 304);
      return page.getByLabel("Diagram status").textContent();
    })
    .toContain("Selected 1");
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
