import { test, expect, type Page } from "@playwright/test";
import { createProfile, createUserDetail } from "./helpers/factories";

const API = "http://127.0.0.1:4170";
const TOUCH = "reasonai:first-touch:1";
const CAMPAIGN = "/?utm_source=devpost&utm_medium=referral&utm_campaign=hackathon";
const expected = { utm_source: "devpost", utm_medium: "referral", utm_campaign: "hackathon" };

async function fixtureApis(page: Page) {
  await page.route("**/api/v1/me", async route => {
    const user = await page.request.get(`${API}/auth/v1/user`, { headers: route.request().headers() });
    if (!user.ok()) return route.fulfill({ status: 401, json: { detail: "Signed out" } });
    const identity = await user.json();
    await route.fulfill({ json: createProfile({ id: identity.id, display_name: "Acquisition learner", created_at: identity.created_at }) });
  });
  // The legacy profile envelope is outside this fixture's schema. Acquisition,
  // user list, ingestion and all modern Admin analytics use the real HTTP APIs.
  await page.route(/\/api\/v1\/admin\/users\/[0-9a-f-]+$/, async route => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    const detail = createUserDetail();
    await route.fulfill({ json: { ...detail, profile: { ...detail.profile, user_id: id, name: "Acquisition learner", email: "acquisition@example.test" } } });
  });
}

async function oauthSignup(page: Page, account?: string) {
  await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fixture Google consent" })).toBeVisible();
  // A full external-origin reload exercises actual tab storage continuity.
  await page.reload();
  if (account) {
    const href = await page.getByRole("link", { name: "Complete signup" }).getAttribute("href");
    await page.goto(`${API}${href}&account=${account}`);
  } else {
    await page.getByRole("link", { name: "Complete signup" }).click();
  }
  await expect(page).toHaveURL(/localhost:3000\/feed$/);
  const cookies = await page.context().cookies();
  const cookie = cookies.find(c => c.name === "sb-127-auth-token");
  expect(cookie, "real Supabase SDK callback must set its auth cookie").toBeDefined();
  const session = JSON.parse(Buffer.from(cookie!.value.replace(/^base64-/, ""), "base64url").toString());
  expect(session.user.app_metadata.provider).toBe("google");
  return session.user.id as string;
}

async function persisted(page: Page, id: string) {
  return (await page.request.get(`${API}/test-acquisition/${id}`)).json();
}

async function expectAdmin(page: Page, id: string) {
  await page.goto(`/admin/users/${id}?tab=overview`);
  const acquisition = page.getByRole("region", { name: "First-touch acquisition" });
  await expect(acquisition).toBeVisible();
  for (const [label, value] of [["Source", "devpost"], ["Medium", "referral"], ["Campaign", "hackathon"]])
    await expect(acquisition.getByText(label, { exact: true }).locator("..")).toContainText(value);
  await expect(acquisition.getByText("Source", { exact: true }).locator("..")).not.toContainText("Unknown");
}

for (const placeholder of ["absent", "empty", "corrupt"] as const) {
  test(`Devpost landing → login → Google PKCE signup → PostgreSQL → Admin (${placeholder} prior capture)`, async ({ page }) => {
    await fixtureApis(page);
    if (placeholder !== "absent") await page.addInitScript(({ key, value }) => {
      if (!sessionStorage.getItem("fixture:seeded")) {
        sessionStorage.setItem(key, value);
        sessionStorage.setItem("fixture:seeded", "1");
      }
    }, { key: TOUCH, value: placeholder === "empty" ? '{"landing":"home"}' : "{corrupt" });
    await page.goto(CAMPAIGN);
    await expect.poll(() => page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? "null"), TOUCH)).toMatchObject(expected);
    await page.reload();
    await page.getByRole("link", { name: "Log in", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.reload();
    const id = await oauthSignup(page);
    await expect.poll(() => persisted(page, id)).toMatchObject({ properties: expected, events: 1 });
    await expectAdmin(page, id);
    await page.reload();
    await expectAdmin(page, id);
    expect(await persisted(page, id)).toMatchObject({ properties: expected, events: 1 });
    if (placeholder === "empty") await page.screenshot({ path: "../docs/evidence/screenshots/2026-10-23/acquisition/devpost-fixture.png", fullPage: true });
  });
}

test("lost delivery response, refresh, later campaigns and repeated Google login preserve a single first touch", async ({ page }) => {
  await fixtureApis(page);
  let loseResponse = true;
  const acquisitionIds: string[] = [];
  await page.route("**/api/v1/telemetry/events", async route => {
    const events = route.request().postDataJSON().events;
    const acquisition = events.find((event: { event_name: string }) => event.event_name === "acquisition.first_touch");
    if (acquisition) acquisitionIds.push(acquisition.event_id);
    const response = await route.fetch(); // commit before simulating a lost response
    if (acquisition && loseResponse) { loseResponse = false; return route.abort("failed"); }
    return route.fulfill({ response });
  });
  await page.goto(CAMPAIGN);
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  const id = await oauthSignup(page);
  await expect.poll(() => persisted(page, id)).toMatchObject({ properties: expected, events: 1 });
  await page.reload();
  await expect.poll(() => acquisitionIds.length).toBeGreaterThanOrEqual(2);
  expect(new Set(acquisitionIds).size).toBe(1);
  await expect.poll(() => page.evaluate(owner => JSON.parse(sessionStorage.getItem(`reasonai:acquisition:1:${owner}`) ?? "null")?.delivered, id)).toBe(true);
  const deliveredCount = acquisitionIds.length;
  await page.context().clearCookies();
  await page.goto("/?utm_source=youtube&utm_medium=video&utm_campaign=second");
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  expect(await oauthSignup(page, id)).toBe(id);
  await expectAdmin(page, id);
  expect(await persisted(page, id)).toMatchObject({ properties: expected, events: 1 });
  expect(acquisitionIds).toHaveLength(deliveredCount);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("reasonai:later-touch:1")!))).toMatchObject({ utm_source: "youtube" });
});
