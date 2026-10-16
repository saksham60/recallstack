import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import nextConfig from "../../next.config";
import { HARNESS_SHA256 } from "../../src/lib/dsa-execution/python/harness.generated";
import type { ExecutePython, PythonEvidence } from "./core";
/** Isolated disposable browser, no user profile, no provider, no authenticated APIs. */
export async function createCertificationRuntime() {
  const headers = await nextConfig.headers!();
  const csp = headers.find(
    (row) => row.source === "/dsa/python-worker.mjs",
  )!.headers;
  const files = new Map([
    ["/dsa/python-worker.mjs", await readFile("public/dsa/python-worker.mjs")],
    [
      "/dsa/runner-harness.mjs",
      await readFile("public/dsa/runner-harness.mjs"),
    ],
  ]);
  const server = createServer((request, response) => {
    if (request.url === "/") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(
        "<!doctype html><title>Local certification interpreter</title>",
      );
      return;
    }
    const file = files.get(request.url ?? "");
    if (!file) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/javascript",
      ...Object.fromEntries(csp.map((row) => [row.key, row.value])),
    });
    response.end(file);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Local interpreter server unavailable");
  let browser;
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  } catch (error) {
    server.close();
    throw error;
  }
  const context = await browser.newContext({ serviceWorkers: "block" });
  // tsx preserves function names using this identity helper in serialized
  // callbacks. Bootstrap it only in the disposable controller page.
  await context.addInitScript("globalThis.__name = (fn) => fn;");
  const origin = `http://127.0.0.1:${address.port}`;
  const assets = new Set([
    "pyodide.mjs",
    "pyodide.asm.js",
    "pyodide.asm.wasm",
    "python_stdlib.zip",
    "pyodide-lock.json",
  ]);
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === origin &&
      ["/", "/dsa/python-worker.mjs", "/dsa/runner-harness.mjs"].includes(
        url.pathname,
      )
    )
      return route.continue();
    const prefix = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";
    if (
      url.href.startsWith(prefix) &&
      assets.has(url.href.slice(prefix.length))
    ) {
      const name = url.href.slice(prefix.length);
      return route.fulfill({
        path: path.resolve("node_modules/pyodide", name),
        contentType: name.endsWith(".wasm")
          ? "application/wasm"
          : name.endsWith(".json")
            ? "application/json"
            : name.endsWith(".zip")
              ? "application/octet-stream"
              : "text/javascript",
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  await page.goto(origin);
  const execute: ExecutePython = async (code, contract, input) =>
    page.evaluate(
      ({ code, contract, input, sha }) =>
        new Promise<PythonEvidence>((resolve) => {
          const worker = new Worker("/dsa/python-worker.mjs", {
            type: "module",
          });
          let timer: ReturnType<typeof setTimeout>;
          const finish = (value: PythonEvidence) => {
            clearTimeout(timer);
            worker.terminate();
            resolve(value);
          };
          timer = setTimeout(
            () => finish({ status: "initialization_timeout" }),
            60000,
          );
          worker.onerror = () => finish({ status: "worker_error" });
          worker.onmessage = (event) => {
            const data = event.data;
            if (data.harnessSha256 !== sha) {
              finish({ status: "harness_mismatch" });
              return;
            }
            if (data.error) {
              finish({ status: "worker_error" });
              return;
            }
            if (data.phase === "initializing") return;
            if (data.phase === "running") {
              clearTimeout(timer);
              timer = setTimeout(
                () => finish({ status: "time_limit_exceeded" }),
                3000,
              );
              return;
            }
            const result = data.results?.[0];
            finish(
              result?.id === "fixture"
                ? {
                    status: result.status,
                    actual: result.actual,
                    durationMs: result.durationMs,
                  }
                : { status: "malformed_result" },
            );
          };
          worker.postMessage({
            code,
            contract,
            cases: [{ id: "fixture", input }],
          });
        }),
      { code, contract, input, sha: HARNESS_SHA256 },
    );
  return {
    execute,
    close: async () => {
      await context.close();
      await browser.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
