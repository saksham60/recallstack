import { expect, test } from "@playwright/test";
import {
  SYSTEM_DESIGN_SCHEMA_VERSION,
  type SystemDesignDocument,
  type SystemDesignProblem,
} from "../src/features/system-design/types/system-design.types";
import { prepareInteractiveSystemDesignHtml } from "../src/features/system-design/utils/interactive-html-export";

const now = "2026-08-04T00:00:00.000Z";

const problem: SystemDesignProblem = {
  id: "url-shortener",
  slug: "URL Shortener",
  title: "URL Shortener",
  summary: "Design a globally available short-link platform.",
  category: "Web scale",
  difficulty: "medium",
  estimatedMinutes: 45,
  requirements: ["Create short links", "Redirect with low latency"],
  scaleAssumptions: ["100M redirects per day"],
  tags: ["routing", "cache"],
};

function createDocument(): SystemDesignDocument {
  return {
    schemaVersion: SYSTEM_DESIGN_SCHEMA_VERSION,
    id: "url-shortener-design",
    problemId: problem.id,
    title: problem.title,
    status: "in_progress",
    rootDiagramId: "root",
    diagrams: {
      root: {
        id: "root",
        name: "URL Shortener",
        nodes: [
          {
            id: "production-vpc",
            type: "vpc_boundary",
            label: "Production VPC",
            x: 30,
            y: 45,
            width: 840,
            height: 410,
            layer: 0,
            locked: true,
            visible: true,
            style: {
              fill: "#0f172a",
              stroke: "#38bdf8",
              strokeWidth: 2,
              borderRadius: 18,
              borderStyle: "dotted",
              opacity: 0.55,
            },
          },
          {
            id: "gateway",
            type: "api_gateway",
            label: "API </script><script>alert(1)</script>",
            subtitle: "Public routing tier",
            description: "Routes public traffic safely.",
            technology: {
              id: "kong",
              name: "Kong Gateway",
              category: "networking",
            },
            x: 80,
            y: 120,
            width: 170,
            height: 88,
            layer: 1,
            locked: false,
            visible: true,
            style: {
              fill: "#111827",
              stroke: "#22d3ee",
              strokeWidth: 3,
              borderRadius: 18,
              borderStyle: "dashed",
              opacity: 0.75,
            },
            textStyle: {
              color: "#f0fdfa",
              fontFamily: "Arial",
              fontSize: 16,
              lineHeight: 1.1,
              padding: 10,
              fontWeight: "bold",
              fontStyle: "italic",
              textDecoration: "underline",
              align: "right",
              verticalAlign: "top",
            },
            metadata: { status: "healthy", owner: "edge-platform" },
          },
          {
            id: "analytics",
            type: "logical_module",
            label: "Analytics",
            description: "Reporting and event processing",
            childDiagramId: "analytics-diagram",
            isExpandable: true,
            x: 360,
            y: 100,
            width: 220,
            height: 120,
            layer: 2,
            locked: false,
            visible: true,
          },
          {
            id: "architecture-image",
            type: "image",
            label: "Approved architecture mark",
            asset: {
              kind: "svg",
              mimeType: "image/svg+xml",
              svg: '<svg viewBox="0 0 48 24"><rect width="48" height="24" fill="#a78bfa"/></svg>',
              intrinsicWidth: 48,
              intrinsicHeight: 24,
              name: "architecture.svg",
            },
            x: 650,
            y: 120,
            width: 180,
            height: 96,
            layer: 3,
            locked: false,
            visible: true,
            style: { stroke: "#c084fc", borderRadius: 12 },
          },
          {
            id: "hidden-legacy",
            type: "service",
            label: "Hidden legacy service",
            x: 650,
            y: 320,
            width: 170,
            height: 88,
            layer: 4,
            locked: false,
            visible: false,
          },
        ],
        edges: [
          {
            id: "publish-events",
            sourceNodeId: "gateway",
            targetNodeId: "analytics",
            sourcePort: "right",
            targetPort: "left",
            type: "event_stream",
            label: "Click events",
            lineStyle: "dash_dot",
            dashPattern: [12, 4, 2, 4],
            routing: "orthogonal",
            color: "#22d3ee",
            opacity: 0.65,
            strokeWidth: 4,
            startArrowhead: "diamond",
            endArrowhead: "filled_triangle",
            labelIcon: "stream",
            labelPosition: 0,
            labelBackground: "#172554",
            labelTextColor: "#ecfeff",
            animationSpeed: 2,
            animationDirection: "alternate",
            description: "Default semantic stream animation",
          },
          {
            id: "module-to-image",
            sourceNodeId: "analytics",
            targetNodeId: "architecture-image",
            sourcePort: "right",
            targetPort: "left",
            type: "custom",
            label: "Snapshot",
            routing: "bidirectional",
            startArrowhead: "circle",
            endArrowhead: "open",
            animationMode: "flow_pulse",
            animationSpeed: 0.8,
            animationDirection: "reverse",
          },
        ],
        viewport: { x: 17, y: -9, zoom: 1.25 },
      },
      "analytics-diagram": {
        id: "analytics-diagram",
        name: "Analytics Module",
        parentNodeId: "analytics",
        nodes: [
          {
            id: "stream",
            type: "event_stream",
            label: "Events",
            technology: {
              id: "kafka",
              name: "Apache Kafka",
              category: "messaging",
            },
            parentModuleId: "analytics",
            x: 100,
            y: 100,
            width: 170,
            height: 88,
            layer: 0,
            locked: false,
            visible: true,
          },
          {
            id: "reporting",
            type: "feature_module",
            label: "Reporting Platform",
            childDiagramId: "reporting-diagram",
            isExpandable: true,
            parentModuleId: "analytics",
            x: 360,
            y: 90,
            width: 230,
            height: 126,
            layer: 1,
            locked: false,
            visible: true,
          },
        ],
        edges: [
          {
            id: "stream-to-reporting",
            sourceNodeId: "stream",
            targetNodeId: "reporting",
            sourcePort: "right",
            targetPort: "left",
            type: "async_message",
            protocol: "Kafka",
          },
        ],
        viewport: { x: 12, y: -8, zoom: 1.1 },
      },
      "reporting-diagram": {
        id: "reporting-diagram",
        name: "Reporting Platform",
        parentNodeId: "reporting",
        nodes: [
          {
            id: "reporting-note",
            type: "assumption_note",
            label: "Reports may lag\nby five minutes",
            description: "Eventual consistency is acceptable.",
            parentModuleId: "reporting",
            x: 80,
            y: 80,
            width: 230,
            height: 120,
            layer: 0,
            locked: false,
            visible: true,
            style: { fill: "#082f49", stroke: "#38bdf8", opacity: 0.9 },
            textStyle: {
              color: "#e0f2fe",
              fontSize: 15,
              lineHeight: 1.4,
              padding: 14,
              align: "center",
              verticalAlign: "middle",
            },
          },
          {
            id: "audit-domain",
            type: "domain_module",
            label: "Audit Domain",
            childDiagramId: "audit-diagram",
            isExpandable: true,
            parentModuleId: "reporting",
            x: 380,
            y: 80,
            width: 220,
            height: 120,
            layer: 1,
            locked: false,
            visible: true,
            technology: {
              id: "custom",
              name: "Internal Ledger",
              category: "custom",
            },
          },
        ],
        edges: [
          {
            id: "note-to-audit",
            sourceNodeId: "reporting-note",
            targetNodeId: "audit-domain",
            sourcePort: "right",
            targetPort: "left",
            type: "failure_fallback",
            label: "Audit fallback",
          },
        ],
        viewport: { x: -30, y: 20, zoom: 0.9 },
      },
      "audit-diagram": {
        id: "audit-diagram",
        name: "Audit Domain",
        parentNodeId: "audit-domain",
        nodes: [
          {
            id: "audit-log",
            type: "text",
            label: "Latency\nAudit Log",
            parentModuleId: "audit-domain",
            x: 120,
            y: 100,
            width: 250,
            height: 130,
            layer: 0,
            locked: false,
            visible: true,
            textStyle: {
              color: "#fef3c7",
              fontFamily: "Georgia",
              fontSize: 22,
              lineHeight: 1.25,
              padding: 18,
              fontWeight: "bold",
              fontStyle: "italic",
              textDecoration: "underline",
              align: "right",
              verticalAlign: "bottom",
            },
            metadata: { status: "append-only", retention: "7 years" },
          },
        ],
        edges: [],
        viewport: { x: 8, y: 14, zoom: 1.2 },
      },
    },
    createdAt: now,
    updatedAt: now,
  };
}

test.describe("interactive system-design HTML export", () => {
  test("creates a problem-neutral diagram-only viewer with freehand ink", async ({
    page,
  }) => {
    const document = createDocument();
    document.diagrams.root.nodes.push({
      id: "ink-stroke",
      type: "freehand",
      x: 120,
      y: 260,
      width: 90,
      height: 48,
      label: "Freehand drawing",
      layer: 5,
      locked: false,
      visible: true,
      drawing: {
        points: [3, 30, 18, 8, 45, 22, 87, 4],
        stroke: "#22d3ee",
        strokeWidth: 4,
        opacity: 0.8,
        lineStyle: "dotted",
        animationMode: "moving_dots",
        animationSpeed: 1.5,
        animationDirection: "reverse",
      },
    });
    const exported = prepareInteractiveSystemDesignHtml(document, {
      mode: "diagram-only",
    });

    expect(exported.filename).toBe("url-shortener-system-design.html");
    expect(exported.html).toContain('data-export-mode="diagram-only"');
    expect(exported.html).not.toContain(problem.summary);
    expect(exported.html).not.toContain(problem.requirements[0]);
    expect(exported.html).not.toMatch(
      /<(?:script|link|img)[^>]+(?:src|href)=["']https?:/i,
    );
    const embedded = exported.html.match(
      /<script type="application\/json" id="system-design-data">([\s\S]*?)<\/script>/,
    );
    const payload = JSON.parse(embedded?.[1] ?? "{}") as {
      mode?: string;
      problem?: unknown;
    };
    expect(payload.mode).toBe("diagram-only");
    expect(payload).not.toHaveProperty("problem");

    await page.setContent(exported.html, { waitUntil: "load" });
    await expect(page.locator(".topbar, .inspector")).toHaveCount(0);
    await expect(
      page.locator('.node[data-id="ink-stroke"] polyline[data-freehand="true"]'),
    ).toBeVisible();
    const freehandMotion = page.locator(
      '.node[data-id="ink-stroke"] polyline.freehand-motion',
    );
    await expect(freehandMotion).toBeVisible();
    await expect(freehandMotion).toHaveAttribute(
      "data-motion-kind",
      "moving_dots",
    );
    await expect
      .poll(async () =>
        Number((await freehandMotion.getAttribute("stroke-dashoffset")) ?? 0),
      )
      .not.toBe(0);
    await expect(page.locator('.edge[data-animation="moving_dash"]')).toBeVisible();
    await page.locator('.node[data-id="analytics"]').dblclick();
    await expect(page.locator('.node[data-id="reporting"]')).toBeVisible();
  });

  test("embeds the complete current-schema document safely without dependencies", () => {
    const exported = prepareInteractiveSystemDesignHtml(
      createDocument(),
      problem,
    );

    expect(exported.filename).toBe("url-shortener-system-design.html");
    expect(exported.html).toContain(
      '<script type="application/json" id="system-design-data">',
    );
    expect(exported.html).toContain("analytics-diagram");
    expect(exported.html).toContain("openModule");
    expect(exported.html).toContain("renderMinimap");
    expect(exported.html).toContain("tickAnimations");
    expect(exported.html).toContain("travelling-particle");
    expect(exported.html).toContain("Content-Security-Policy");
    expect(exported.html).toContain("connect-src 'none'");
    expect(exported.html).not.toContain(
      "API </script><script>alert(1)</script>",
    );
    expect(exported.html).not.toMatch(
      /<(?:script|link|img)[^>]+(?:src|href)=["']https?:/i,
    );
    expect(exported.html).not.toMatch(/[ÃÂâ][\u0080-\u00bf]?/);

    const embedded = exported.html.match(
      /<script type="application\/json" id="system-design-data">([\s\S]*?)<\/script>/,
    );
    expect(embedded).not.toBeNull();
    const payload = JSON.parse(embedded?.[1] ?? "{}") as {
      document?: SystemDesignDocument;
      visuals?: Record<string, { chrome?: string }>;
      semanticGlyphs?: Record<
        string,
        { key?: string; path?: string; style?: string }
      >;
      edgeSemantics?: Record<string, { animationMode?: string }>;
    };
    expect(Object.keys(payload.document?.diagrams ?? {})).toEqual([
      "root",
      "analytics-diagram",
      "reporting-diagram",
      "audit-diagram",
    ]);
    expect(
      payload.document?.diagrams.root.nodes.find(
        (node) => node.id === "gateway",
      ),
    ).toMatchObject({
      style: {
        fill: "#111827",
        stroke: "#22d3ee",
        strokeWidth: 3,
        borderRadius: 18,
        borderStyle: "dashed",
        opacity: 0.75,
      },
      textStyle: {
        fontFamily: "Arial",
        lineHeight: 1.1,
        padding: 10,
        align: "right",
        verticalAlign: "top",
      },
    });
    expect(payload.visuals?.image?.chrome).toBe("image");
    expect(payload.visuals?.logical_module?.chrome).toBe("module");
    expect(payload.semanticGlyphs?.logical_module).toMatchObject({
      key: "logical-module",
      style: "stroke",
    });
    expect(payload.semanticGlyphs?.logical_module?.path).toBeTruthy();
    expect(payload.semanticGlyphs?.vpc_boundary?.key).toBe("vpc");
    expect(payload.edgeSemantics?.event_stream?.animationMode).toBe(
      "moving_dash",
    );
    expect(
      payload.document?.diagrams.root.edges.find(
        (edge) => edge.id === "publish-events",
      )?.labelPosition,
    ).toBe(0);
  });

  test("renders semantic styles, assets, technology marks, rich edges, and selection details", async ({
    page,
  }) => {
    const externalRequests: string[] = [];
    const pageErrors: string[] = [];
    page.on("request", (request) => {
      if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const exported = prepareInteractiveSystemDesignHtml(
      createDocument(),
      problem,
    );
    await page.setContent(exported.html, { waitUntil: "load" });

    await expect(page.locator(".node")).toHaveCount(4);
    await expect(page.locator('.node[data-id="hidden-legacy"]')).toHaveCount(0);
    const gateway = page.locator('.node[data-id="gateway"]');
    await expect(gateway).toHaveAttribute("data-read-only", "true");
    await expect(gateway).toHaveAttribute("opacity", "0.75");
    await expect(gateway.locator('[data-technology="kong"]')).toBeVisible();
    await expect(gateway.locator("[data-semantic-icon]")).toHaveCount(0);
    await expect(gateway.locator("path").first()).toHaveAttribute(
      "fill",
      "#111827",
    );
    await expect(
      page.locator(
        '.node[data-id="analytics"] [data-semantic-icon="logical_module"]',
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        '.node[data-id="production-vpc"] [data-semantic-icon="vpc_boundary"]',
      ),
    ).toHaveAttribute("data-icon-key", "vpc");

    const renderPlanes = await page
      .locator("#world > [data-render-plane]")
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-render-plane")),
      );
    const firstEdge = renderPlanes.indexOf("edges");
    const firstForeground = renderPlanes.indexOf("foreground");
    expect(firstEdge).toBeGreaterThan(renderPlanes.lastIndexOf("background"));
    expect(firstForeground).toBeGreaterThan(renderPlanes.lastIndexOf("edges"));

    const boundarySurface = page.locator(
      '.node[data-id="production-vpc"] > rect:first-child',
    );
    await expect(boundarySurface).toHaveCSS("pointer-events", "stroke");
    const architectureImage = page.locator(
      '.node[data-id="architecture-image"]',
    );
    await expect(architectureImage.locator("image")).toHaveAttribute(
      "data-asset-kind",
      "svg",
    );
    await expect(architectureImage.locator("image")).toHaveAttribute(
      "preserveAspectRatio",
      "xMidYMid meet",
    );
    await expect(architectureImage.locator("image")).toHaveAttribute("x", "0");
    await expect(architectureImage.locator("image")).toHaveAttribute("y", "0");
    await expect(architectureImage.locator("image")).toHaveAttribute("width", "180");
    await expect(architectureImage.locator("image")).toHaveAttribute("height", "96");
    await expect(architectureImage.locator("text")).toHaveCount(0);
    await expect(architectureImage.locator("rect:not(.selection)")).toHaveCount(0);

    const streamEdge = page.locator('.edge[data-id="publish-events"]');
    await expect(streamEdge).toHaveAttribute("data-routing", "orthogonal");
    await expect(streamEdge).toHaveAttribute("data-line-style", "dash_dot");
    await expect(streamEdge).toHaveAttribute("data-animation", "moving_dash");
    await expect(streamEdge).toHaveAttribute("data-label-position", "0");
    await expect(streamEdge.locator(".edge-path")).toHaveAttribute(
      "stroke-dasharray",
      "12 4 2 4",
    );
    await expect(streamEdge.locator(".edge-motion")).toHaveAttribute(
      "data-motion-kind",
      "moving_dash",
    );
    await expect(streamEdge.locator(".edge-motion")).toHaveAttribute(
      "stroke-dasharray",
      "12 4 2 4",
    );
    await expect(streamEdge.locator(".edge-path")).toHaveAttribute(
      "marker-start",
      /url\(#arrow-/,
    );
    await expect(streamEdge.locator(".edge-label")).toHaveAttribute(
      "data-icon",
      "stream",
    );
    await expect(streamEdge.locator(".edge-label")).toHaveAttribute(
      "fill",
      "#ecfeff",
    );
    const pulseEdge = page.locator('.edge[data-id="module-to-image"]');
    await expect(pulseEdge.locator(".edge-motion")).toHaveAttribute(
      "data-motion-kind",
      "flow_pulse",
    );
    await expect(pulseEdge.locator(".edge-motion")).toHaveAttribute(
      "stroke-dasharray",
      "",
    );
    await expect(page.locator("#empty")).toBeHidden();

    const payloadBefore = await page
      .locator("#system-design-data")
      .textContent();
    await gateway.click();
    const details = page.getByRole("complementary", {
      name: "Selection details",
    });
    await expect(details).toContainText("Kong Gateway");
    await expect(details).toContainText("edge-platform");
    await expect(details).toContainText("Text alignment");
    await streamEdge.click();
    await expect(details).toContainText("Event Stream");
    await expect(details).toContainText("moving_dash");
    await expect(details).toContainText("diamond");
    await expect(details).toContainText("Label position");
    expect(await page.locator("[contenteditable='true'], textarea").count()).toBe(0);
    expect(await page.locator("#system-design-data").textContent()).toBe(
      payloadBefore,
    );
    expect(externalRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("navigates every module level, breadcrumbs, Back, and nested search without mutating the document", async ({
    page,
  }) => {
    const exported = prepareInteractiveSystemDesignHtml(
      createDocument(),
      problem,
    );
    await page.setContent(exported.html, { waitUntil: "load" });
    const payloadBefore = await page.locator("#system-design-data").textContent();

    await page.locator('.node[data-id="analytics"]').dblclick();
    await expect(page.getByRole("navigation")).toContainText(
      "URL Shortener/Analytics Module",
    );
    await page.locator('.node[data-id="reporting"]').dblclick();
    await expect(page.getByRole("navigation")).toContainText(
      "Reporting Platform",
    );
    await page.locator('.node[data-id="audit-domain"]').dblclick();
    await expect(page.getByRole("navigation")).toContainText("Audit Domain");
    await expect(page.locator('.node[data-id="audit-log"]')).toBeVisible();

    await page.getByRole("button", { name: /Back/ }).click();
    await expect(page.locator('.node[data-id="audit-domain"]')).toBeVisible();
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(page.locator('.node[data-id="reporting"]')).toBeVisible();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "URL Shortener" })
      .click();
    await expect(page.locator('.node[data-id="gateway"]')).toBeVisible();

    await page.getByRole("searchbox", { name: "Search components" }).fill(
      "append-only",
    );
    const result = page.locator(".search-result").filter({
      hasText: "Latency Audit Log",
    });
    await expect(result).toBeVisible();
    await result.click();
    await expect(page.locator('.node[data-id="audit-log"]')).toHaveClass(
      /selected/,
    );
    await expect(page.getByRole("navigation")).toContainText("Audit Domain");
    await expect(
      page.getByRole("complementary", { name: "Selection details" }),
    ).toContainText("7 years");
    await page.getByRole("button", { name: /Back/ }).click();
    await expect(page.locator('.node[data-id="audit-domain"]')).toBeVisible();
    await expect(
      page.locator('.node[data-id="audit-domain"] [data-technology="custom"]'),
    ).toBeVisible();
    expect(await page.locator("#system-design-data").textContent()).toBe(
      payloadBefore,
    );
  });

  test("supports pan, zoom, fit, saved reset, minimap, and motion controls", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const designDocument = createDocument();
    designDocument.diagrams.root.edges.push(
      {
        id: "moving-dots",
        sourceNodeId: "gateway",
        targetNodeId: "architecture-image",
        sourcePort: "bottom",
        targetPort: "top",
        type: "custom",
        animationMode: "moving_dots",
        animationSpeed: 1.2,
        animationDirection: "reverse",
      },
      {
        id: "direction-pulse",
        sourceNodeId: "gateway",
        targetNodeId: "analytics",
        sourcePort: "top",
        targetPort: "bottom",
        type: "custom",
        routing: "curved",
        animationMode: "direction_pulse",
        animationSpeed: 1.4,
        animationDirection: "alternate",
      },
    );
    const exported = prepareInteractiveSystemDesignHtml(
      designDocument,
      problem,
    );
    await page.setContent(exported.html, { waitUntil: "load" });
    const world = page.locator("#world");

    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(world).toHaveAttribute(
      "transform",
      "translate(17 -9) scale(1.25)",
    );
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.locator("#zoom-output")).toHaveText("144%");
    const afterZoom = await world.getAttribute("transform");
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    await expect(world).not.toHaveAttribute("transform", afterZoom ?? "");

    const canvas = page.locator("#canvas");
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Expected the exported canvas to be visible.");
    const beforePan = await world.getAttribute("transform");
    await page.mouse.move(bounds.x + 10, bounds.y + bounds.height - 10);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 70, bounds.y + bounds.height - 50);
    await page.mouse.up();
    await expect(world).not.toHaveAttribute("transform", beforePan ?? "");

    const map = page.getByRole("button", { name: "Diagram minimap" });
    const beforeMap = await world.getAttribute("transform");
    await map.click({ position: { x: 150, y: 30 } });
    await expect(world).not.toHaveAttribute("transform", beforeMap ?? "");
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect(map).toBeHidden();
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect(map).toBeVisible();

    const animatedOverlay = page.locator(
      '.edge[data-id="publish-events"] .edge-motion',
    );
    const dashOffsetBefore = await animatedOverlay.getAttribute(
      "stroke-dashoffset",
    );
    await page.waitForTimeout(100);
    await expect(animatedOverlay).not.toHaveAttribute(
      "stroke-dashoffset",
      dashOffsetBefore ?? "",
    );
    await expect(
      page.locator('.edge[data-id="moving-dots"] .edge-motion'),
    ).toHaveAttribute("stroke-dasharray", "1 11");
    const travellingParticle = page.locator(
      '.edge[data-id="direction-pulse"] [data-motion-kind="travelling-particle"]',
    );
    await expect(travellingParticle).toHaveCount(1);
    const particlePositionBefore = await travellingParticle.evaluate(
      (element) => [element.getAttribute("cx"), element.getAttribute("cy")],
    );
    await page.waitForTimeout(100);
    expect(
      await travellingParticle.evaluate((element) => [
        element.getAttribute("cx"),
        element.getAttribute("cy"),
      ]),
    ).not.toEqual(particlePositionBefore);
    const hiddenClassApplied = await page.evaluate(() => {
      try {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
        return document.body.classList.contains("document-hidden");
      } catch {
        return false;
      }
    });
    expect(hiddenClassApplied).toBe(true);
    await expect(animatedOverlay).toBeHidden();
    await page.getByRole("button", { name: "Flow", exact: true }).click();
    await expect(page.locator("body")).toHaveClass(/animations-off/);
    await expect(animatedOverlay).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Flow", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");

    await page.getByRole("button", { name: "Flow", exact: true }).click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(animatedOverlay).toBeHidden();
  });
});
