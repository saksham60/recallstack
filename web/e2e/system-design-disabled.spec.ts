import { expect, test } from "@playwright/test";
import { setupAuth } from "./helpers/auth";
import { createProfile } from "./helpers/factories";

test("the disabled feature flag hides navigation and both routes", async ({
  page,
}) => {
  await setupAuth(page);
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ json: createProfile({ roles: ["admin"] }) }),
  );

  await page.goto("/admin");
  await expect(
    page
      .getByRole("navigation", { name: "Admin navigation" })
      .getByRole("link", { name: "System Design", exact: true }),
  ).toHaveCount(0);

  await page.goto("/admin/system-design");
  await expect(
    page.getByText("This page could not be found.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "System Design Problems" }),
  ).toHaveCount(0);

  await page.goto("/admin/system-design/url-shortener");
  await expect(
    page.getByText("This page could not be found.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("system-design-canvas")).toHaveCount(0);
});
