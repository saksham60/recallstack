import { expect, test } from "./fixtures/authenticated-test";
import { createStudyNoteResponse } from "./helpers/factories";

test.describe("Practice links", () => {
  test("uses the content item's primary imported practice resource", async ({
    authenticatedPage: page,
  }) => {
    await page.route("**/api/v1/content/*", async (route) => {
      await route.fulfill({
        json: createStudyNoteResponse({
          title: "3Sum",
          slug: "ultimate-dsa-016-3sum",
          practice_resources: [
            {
              id: "secondary-resource",
              provider_slug: "geeksforgeeks",
              provider_name: "GeeksForGeeks",
              external_key: null,
              title: "Related problem",
              url: "https://www.geeksforgeeks.org/related-problem/",
              is_primary: false,
              sort_order: 1,
            },
            {
              id: "primary-resource",
              provider_slug: "leetcode",
              provider_name: "LeetCode",
              external_key: "3sum",
              title: "3Sum",
              url: "https://leetcode.com/problems/3sum/",
              is_primary: true,
              sort_order: 0,
            },
          ],
        }),
      });
    });

    await page.goto("/content/ultimate-dsa-016-3sum");

    const practiceLink = page.getByRole("link", { name: "Practice on LeetCode" });
    await expect(practiceLink).toHaveAttribute(
      "href",
      "https://leetcode.com/problems/3sum/",
    );
    await expect(practiceLink).toHaveAttribute("target", "_blank");
    await expect(practiceLink).toHaveAttribute("rel", "noopener noreferrer");
  });
});
