import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readdir, readFile, stat, unlink } from "node:fs/promises";

if (Number(process.versions.node.split(".")[0]) < 22)
  throw new Error("DSA production verification requires Node.js 22 or later (see package.json engines).");

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:4160",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "dsa-navigation-fixture-anon-key",
  NEXT_PUBLIC_API_BASE_URL: "http://localhost:8080",
};
const root = fileURLToPath(new URL("../", import.meta.url));
// Next's data cache survives builds. Remove only this loopback fixture's small
// taxonomy entries so a repeated verification run still measures a cold read.
// Other cached resources and the user's application files are left in place.
const cache = new URL("../.next/cache/fetch-cache/", import.meta.url);
for (const name of await readdir(cache).catch(() => [])) {
  if (!/^[a-f0-9]{64}$/.test(name)) continue;
  const file = new URL(name, cache);
  if ((await stat(file)).size > 100_000) continue;
  let entry;
  try { entry = JSON.parse(await readFile(file, "utf8")); } catch { continue; }
  if (entry.data?.url?.startsWith("http://127.0.0.1:4160/api/v1/dsa/categories?"))
    await unlink(file);
}
function run(script, args) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run("./prepare-monaco.mjs", []);
run("./prepare-python-harness.mjs", []);
// Both before/after runs use the same production compiler. Turbopack stalled
// in this Windows workspace; this does not change the application's compiler.
run("../node_modules/next/dist/bin/next", ["build", "--webpack"]);
run("../node_modules/@playwright/test/cli.js", ["test", "--config=playwright.dsa-navigation.config.ts", ...process.argv.slice(2)]);
