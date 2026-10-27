import { expect, test } from "./fixtures/authenticated-test";
import { installV3API } from "./helpers/dsa-v3";
import { writeFile } from "node:fs/promises";

// Browser frame sampling measures rendered feedback, rather than the time at
// which application code merely sets a flag. No instrumentation ships to users.
test("production navigation records cold and repeat painted timings", async ({ authenticatedPage: page }, info) => {
  await page.request.post("http://127.0.0.1:4160/__fixture", {
    data: { categoryDelayMs: 900 },
  });
  await installV3API(page, { count: 151 });
  await page.route("**/api/v1/dsa/problems?**", async route => {
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.fallback();
  });
  await page.addInitScript(() => {
    const samples: Array<Record<string, number | string | null>> = [];
    Object.assign(window, { navigationSamples: samples });
    document.addEventListener("click", event => {
      const link = (event.target as Element).closest<HTMLAnchorElement>(".dsa-topic-card");
      if (!link) return;
      const destination = link.pathname;
      const start = performance.now();
      const sample: Record<string, number | string | null> = {
        topic: link.pathname, feedbackMs: null, pendingMs: null, skeletonMs: null, routeSkeletonMs: null,
        routeMs: null, firstContentMs: null, completeMs: null,
      };
      samples.push(sample);
      function visible(selector: string) {
        return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(element =>
          element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden",
        );
      }
      function frame() {
        const elapsed = performance.now() - start;
        const pending = visible('[data-dsa-link-pending="true"]');
        const skeleton = visible('[data-dsa-route-loading], .dsa-board [role="status"]');
        const routeSkeleton = visible('[data-dsa-route-loading]');
        const first = visible(".dsa-problem-link");
        if (pending && sample.pendingMs === null) sample.pendingMs = elapsed;
        if (skeleton && sample.skeletonMs === null) sample.skeletonMs = elapsed;
        if (routeSkeleton && sample.routeSkeletonMs === null) sample.routeSkeletonMs = elapsed;
        if ((pending || skeleton || first) && sample.feedbackMs === null) sample.feedbackMs = elapsed;
        if (location.pathname === destination && visible(".dsa-topic-heading h1") && sample.routeMs === null) sample.routeMs = elapsed;
        if (first && sample.firstContentMs === null) sample.firstContentMs = elapsed;
        if (visible(".dsa-count")?.textContent === "151 problems") sample.completeMs = elapsed;
        if (sample.completeMs === null && elapsed < 20_000) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }, true);
  });
  await page.goto("/dsa");
  for (const [index, topic] of ["Arrays", "Graphs", "Arrays"].entries()) {
    const click = page.locator(".dsa-topic-card").filter({ has: page.getByRole("heading", { name: topic, exact: true }) }).click();
    if (process.env.DSA_NAVIGATION_CAPTURE === "after" && index === 0) {
      await expect(page.locator("[data-dsa-route-loading]")).toBeVisible();
      await expect(page.getByRole("status", { name: "Loading topic board" })).toBeVisible();
      await page.screenshot({ path: info.outputPath("topic-route-skeleton.png") });
    }
    await click;
    await expect(page.locator(".dsa-problem-card")).toHaveCount(151);
    await page.waitForFunction(() => {
      const samples = (window as unknown as { navigationSamples: Array<{ completeMs: number | null }> }).navigationSamples;
      return samples.at(-1)?.completeMs != null;
    });
    // Client navigation preserves both the query cache and timing samples.
    if (await page.evaluate(() => (window as unknown as { navigationSamples: unknown[] }).navigationSamples.length) < 3)
      await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "DSA" }).click();
  }
  const samples = await page.evaluate(() => (window as unknown as {
    navigationSamples: Array<{ feedbackMs: number; firstContentMs: number; completeMs: number }>
  }).navigationSamples);
  const server = await (await page.request.get("http://127.0.0.1:4160/__fixture")).json();
  const report = { mode: "next build + next start", categoryDelayMs: 900, problemPageDelayMs: 250, problemCount: 151, samples, categoryRequests: server.requests };
  await info.attach("navigation-performance", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
  const capture = process.env.DSA_NAVIGATION_CAPTURE;
  if (capture === "before" || capture === "after")
    await writeFile(`../docs/dsa-navigation-${capture}.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
  if (capture !== "before") {
    for (const sample of samples) expect(sample.feedbackMs).toBeLessThan(200);
    // Controlled page delays, rather than an uncontrolled internet SLA.
    expect(samples[0].firstContentMs).toBeLessThan(samples[0].completeMs - 500);
  }
});
