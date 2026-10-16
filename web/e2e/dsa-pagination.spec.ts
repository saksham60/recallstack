import { expect, test } from "./fixtures/authenticated-test";
import { installV3API } from "./helpers/dsa-v3";

for (const count of [0, 1, 24, 25, 26, 50, 51, 151]) {
  test(`topic board loads complete summary pages without duplicate cards for ${count} problems`, async ({
    authenticatedPage: page,
  }) => {
    const data = await installV3API(page, { count });
    await page.goto("/dsa/arrays");
    await expect(page.locator(".dsa-problem-card")).toHaveCount(count);
    await expect(page.locator(".dsa-count")).toHaveText(`${count} problems`);
    const ids = await page
      .locator(".dsa-problem-link")
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
  await page.getByLabel("Difficulty filter").selectOption("easy");
  await page.getByLabel("Search problems").fill("Array total");
  await expect(page.locator(".dsa-problem-card")).toHaveCount(1);
  await page.reload();
  await expect(page.getByLabel("Difficulty filter")).toHaveValue("easy");
  await expect(page.getByLabel("Search problems")).toHaveValue("Array total");
  await page.locator(".dsa-problem-link").click();
  await expect(page.locator(".studio-title h1")).toHaveText("Array total");
  await page.goBack();
  await expect(page.getByLabel("Search problems")).toHaveValue("Array total");
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
