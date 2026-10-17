// Loopback-only server-side routing fixture. Not imported by application code.
import { createServer } from "node:http";
const id = "10000000-0000-4000-8000-000000000001";
const version = "20000000-0000-4000-8000-000000000001";
const categories = [{ id: "30000000-0000-4000-8000-000000000001", slug: "arrays", name: "Arrays", problem_count: 4 }, { id: "30000000-0000-4000-8000-000000000002", slug: "graphs", name: "Graphs", problem_count: 0 }];
createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:4160");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  let body;
  if (url.pathname === "/health") body = { ok: true };
  else if (url.pathname.endsWith("/categories")) body = { items: categories };
  else if (url.pathname.endsWith("/resolve")) {
    const value = url.searchParams.get("problem");
    const second = value === "binary-search" || value?.endsWith("000002");
    const requestedVersion = url.searchParams.get("problem_version_id") ?? version;
    if (value === "missing" || requestedVersion.endsWith("999999")) { res.statusCode = 404; body = { error: "Unavailable" }; }
    else body = { id: second ? id.slice(0, -1) + "2" : id, problem_version_id: requestedVersion, slug: second ? "binary-search" : value === "3sum" ? "3sum" : "array-total", title: second ? "Binary search" : "Array total", categories: [categories[0]], topics: [] };
  } else { res.statusCode = 404; body = { error: "Unknown fixture" }; }
  res.end(JSON.stringify(body));
}).listen(4160, "127.0.0.1");
