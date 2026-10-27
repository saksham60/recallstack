// Loopback-only server-side routing fixture. Not imported by application code.
import { createServer } from "node:http";
const id = "10000000-0000-4000-8000-000000000001";
const version = "20000000-0000-4000-8000-000000000001";
const categories = [{ id: "30000000-0000-4000-8000-000000000001", slug: "arrays", name: "Arrays", problem_count: 4 }, { id: "30000000-0000-4000-8000-000000000002", slug: "graphs", name: "Graphs", problem_count: 0 }];
let settings = { categoryDelayMs: 0, categoryStatus: 200, revision: 0 };
let requests = [];
createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:4160");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  let body;
  if (url.pathname === "/health") body = { ok: true };
  else if (url.pathname === "/__fixture") {
    if (req.method === "POST") {
      let input = "";
      for await (const chunk of req) input += chunk;
      const change = JSON.parse(input || "{}");
      settings = {
        categoryDelayMs: Math.min(5000, Math.max(0, Number(change.categoryDelayMs ?? 0))),
        categoryStatus: [200, 503].includes(change.categoryStatus) ? change.categoryStatus : 200,
        revision: Number(change.revision ?? 0),
      };
      requests = [];
    }
    body = { settings, requests };
  } else if (url.pathname === "/auth/v1/user") {
    // Production-mode tests use the real middleware against this loopback auth
    // fixture, never the development-only authentication bypass.
    let claims;
    try { claims = JSON.parse(Buffer.from((req.headers.authorization ?? "").split(".")[1], "base64url").toString()); } catch {}
    if (!claims?.sub || claims.exp < Date.now() / 1000) {
      res.statusCode = 401;
      body = { message: "Invalid fixture session" };
    } else body = { id: claims.sub, email: claims.email, aud: "authenticated", role: "authenticated" };
  } else if (url.pathname.endsWith("/categories")) {
    const preview = url.searchParams.get("preview") === "true";
    let subject;
    try { subject = JSON.parse(Buffer.from((req.headers.authorization ?? "").split(".")[1], "base64url").toString()).sub; } catch {}
    const started = Date.now();
    const entry = { preview, authenticated: !!req.headers.authorization, started, durationMs: null };
    requests.push(entry);
    await new Promise(resolve => setTimeout(resolve, settings.categoryDelayMs));
    res.statusCode = settings.categoryStatus;
    if (preview && subject !== "test-user-id") res.statusCode = 403;
    const available = settings.revision ? [...categories, { ...categories[1], id: "30000000-0000-4000-8000-000000000003", slug: "new-topic", name: "New topic" }] : categories;
    body = res.statusCode === 200 ? { items: available.map(category => ({
      ...category,
      name: category.name + (preview ? " preview" : ""),
    })) } : { error: "Fixture catalog unavailable" };
    entry.durationMs = Date.now() - started;
  }
  else if (url.pathname.endsWith("/resolve")) {
    const value = url.searchParams.get("problem");
    const second = value === "binary-search" || value?.endsWith("000002");
    const requestedVersion = url.searchParams.get("problem_version_id") ?? version;
    if (value === "missing" || requestedVersion.endsWith("999999")) { res.statusCode = 404; body = { error: "Unavailable" }; }
    else body = { id: second ? id.slice(0, -1) + "2" : id, problem_version_id: requestedVersion, slug: second ? "binary-search" : value === "3sum" ? "3sum" : "array-total", title: second ? "Binary search" : "Array total", categories: [categories[0]], topics: [] };
  } else { res.statusCode = 404; body = { error: "Unknown fixture" }; }
  res.end(JSON.stringify(body));
}).listen(4160, "127.0.0.1");
