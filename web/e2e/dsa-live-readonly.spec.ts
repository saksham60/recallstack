import { expect, test } from "@playwright/test";

test("deployed public catalog reaches the browser without fixtures or learner writes", async ({
  page,
}) => {
  test.skip(
    process.env.DSA_LIVE_READONLY !== "1",
    "Opt in to a read-only check against the configured real API.",
  );
  await page
    .context()
    .addCookies([
      { name: "e2e-bypass-auth", value: "1", domain: "localhost", path: "/" },
    ]);
  const learnerRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/v1/dsa/me/"))
      learnerRequests.push(request.url());
  });
  const response = page.waitForResponse(
    (result) => new URL(result.url()).pathname === "/api/v1/dsa/categories",
  );
  await page.goto("/dsa");
  const catalog = await response;
  expect(catalog.status()).toBe(200);
  const body = await catalog.json();
  expect(Array.isArray(body.items)).toBeTruthy();
  if (!body.items.length)
    await expect(
      page.getByRole("heading", { name: "No topics available yet" }),
    ).toBeVisible();
  else
    await expect(
      page.locator(".dsa-topic-card").filter({ hasText: body.items[0].name }),
    ).toBeVisible();
  expect(learnerRequests).toEqual([]);
  await page.addStyleTag({
    content:
      "nextjs-portal, .tsqd-parent-container { display:none!important; }",
  });
  await page.screenshot({
    path: ".next/cache/dsa-live-catalog.png",
    fullPage: true,
  });
});
