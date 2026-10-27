import { expect, test } from "./fixtures/authenticated-test";
import { installV3API } from "./helpers/dsa-v3";

for (const count of [0, 1, 24, 25, 26, 50, 51, 151]) {
  test(`topic board loads complete summary pages without duplicate cards for ${count} problems`, async ({
    authenticatedPage: page,
  }) => {
    const data = await installV3API(page, { count });
    await page.goto("/dsa/arrays");
    await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(count);
    await expect(page.locator(".dsa-count:visible")).toHaveText(`${count} problems`);
    const ids = await page
      .locator(".dsa-problem-link:visible")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href")));
    expect(new Set(ids).size).toBe(count);
    const requests = data.calls.filter((u) => u.pathname.endsWith("/problems"));
    expect(
      new Set(requests.map((u) => u.searchParams.get("cursor") ?? "first"))
        .size,
    ).toBe(Math.max(1, Math.ceil(count / 50)));
    expect(data.calls.some((u) => /\/problems\//.test(u.pathname))).toBe(false);
  });
}

test("filters survive refresh and browser back from a workspace", async ({
  authenticatedPage: page,
}) => {
  await installV3API(page, { count: 51 });
  await page.goto("/dsa/arrays");
  const difficulty = page.getByRole("combobox", { name: "Difficulty filter" });
  const search = page.getByRole("textbox", { name: "Search problems" });
  await difficulty.selectOption("easy");
  await search.fill("Array total");
  await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(1);
  await page.reload();
  // Streamed HTML can temporarily retain a hidden copy during hydration.
  await expect(difficulty).toHaveValue("easy");
  await expect(search).toHaveValue("Array total");
  await page.locator(".dsa-problem-link:visible").click();
  await expect(page.locator(".studio-title h1:visible")).toHaveText("Array total");
  await page.goBack();
  await expect(search).toHaveValue("Array total");
});

test("malformed cursors fail explicitly instead of silently showing a partial board", async ({
  authenticatedPage: page,
}) => {
  await installV3API(page);
  await page.route("**/api/v1/dsa/problems?**", (r) =>
    r.fulfill({ json: { items: [], has_more: true, next_cursor: null } }),
  );
  await page.goto("/dsa/arrays");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Could not reach the DSA service" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try again" }).first(),
  ).toBeVisible();
});

for (const corruption of ["duplicate", "cycle"] as const) {
  test(`${corruption} on a later page stops safely and preserves a recoverable board`, async ({ authenticatedPage: page }) => {
    const fixture = await installV3API(page, { count: 51 });
    let corrupt = true;
    await page.route("**/api/v1/dsa/problems?**", async route => {
      const cursor = new URL(route.request().url()).searchParams.get("cursor");
      if (cursor && corrupt) return route.fulfill({ json: {
        items: [fixture.problems[corruption === "duplicate" ? 0 : 50]],
        has_more: corruption === "cycle",
        next_cursor: corruption === "cycle" ? cursor : null,
      } });
      return route.fallback();
    });
    await page.goto("/dsa/arrays");
    await expect(page.getByRole("button", { name: "Retry remaining problems" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reorder Array total", exact: true })).toBeDisabled();
    const links = await page.locator(".dsa-problem-link:visible").evaluateAll(nodes => nodes.map(n => n.getAttribute("href")));
    expect(new Set(links).size).toBe(links.length);
    corrupt = false;
    await page.getByRole("button", { name: "Retry remaining problems" }).click();
    await expect(page.locator(".dsa-count:visible")).toHaveText("51 problems");
    await expect(page.locator(".dsa-problem-card:visible")).toHaveCount(51);
  });
}
