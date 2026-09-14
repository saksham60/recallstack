import { expect, test } from "@playwright/test";
import { JudgeLoginOption } from "../src/app/(auth)/login/JudgeLoginOption";
import { handleDemoLogin } from "../src/app/api/auth/demo/handler";

const request = (origin = "https://reasonai.test") => new Request("https://reasonai.test/api/auth/demo", {
  method: "POST",
  headers: { origin },
});

test("judge option is rendered only when server configuration enables it", () => {
  const enabled = JSON.stringify(JudgeLoginOption({ enabled: true, disabled: false }));
  expect(enabled).toContain("Continue as Hackathon Judge");
  expect(enabled).toContain("No account setup required");
  expect(enabled).toContain("/api/auth/demo");
  expect(enabled).toContain("post");
  expect(JudgeLoginOption({ enabled: false, disabled: false })).toBeNull();
});

test("successful judge login uses configured credentials and redirects to DSA", async () => {
  const received: { email: string; password: string }[] = [];
  const response = await handleDemoLogin(request(), {
    enabled: true,
    email: "judge@example.test",
    password: "private-password",
    signInWithPassword: async (credentials) => {
      received.push(credentials);
      return { error: null };
    },
  });

  expect(received).toEqual([{ email: "judge@example.test", password: "private-password" }]);
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("https://reasonai.test/dsa");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).not.toContain("private-password");
});

test("disabled judge access never attempts authentication", async () => {
  let attempts = 0;
  const response = await handleDemoLogin(request(), {
    enabled: false,
    email: "judge@example.test",
    password: "private-password",
    signInWithPassword: async () => {
      attempts += 1;
      return { error: null };
    },
  });

  expect(attempts).toBe(0);
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("https://reasonai.test/login?error=demo-disabled");
});

test("missing credentials, auth errors and thrown failures use the safe failure redirect", async () => {
  for (const options of [
    { email: undefined, password: undefined, signInWithPassword: async () => ({ error: null }) },
    { email: "judge@example.test", password: "wrong", signInWithPassword: async () => ({ error: new Error("private provider detail") }) },
    { email: "judge@example.test", password: "wrong", signInWithPassword: async () => { throw new Error("private network detail"); } },
  ]) {
    const response = await handleDemoLogin(request(), { enabled: true, ...options });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://reasonai.test/login?error=demo-auth-failed");
    expect(await response.text()).not.toMatch(/private|judge@example/);
  }
});

test("cross-origin and origin-less requests are rejected before authentication", async () => {
  let attempts = 0;
  const options = {
    enabled: true,
    email: "judge@example.test",
    password: "private-password",
    signInWithPassword: async () => {
      attempts += 1;
      return { error: null };
    },
  };

  expect((await handleDemoLogin(request("https://attacker.test"), options)).status).toBe(403);
  expect((await handleDemoLogin(new Request("https://reasonai.test/api/auth/demo", { method: "POST" }), options)).status).toBe(403);
  expect(attempts).toBe(0);
});
