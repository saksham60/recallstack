// This dedicated, ephemeral module Worker has no access to parent-window DOM,
// Supabase tokens, or private fixtures. Pin the external interpreter version.
// This is an educational local runner, NEVER a trusted hidden-test judge.
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/pyodide.mjs";
const CDN = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";
let runtimePromise;
const PYTHON = [
  "import contextlib, io, json, traceback",
  "capture = io.StringIO()",
  "try:",
  "    scope = {'__name__': 'reasonai_local_solution'}",
  "    with contextlib.redirect_stdout(capture):",
  "        exec(compile(_dsa_code, 'solution.py', 'exec'), scope)",
  "        fn = scope['solve']",
  "        value = fn(json.loads(_dsa_input))",
  "    outcome = {'ok': True, 'actual': value, 'stdout': capture.getvalue()[:4096]}",
  "except BaseException:",
  "    outcome = {'ok': False, 'error': traceback.format_exc(limit=5)[-4096:]}",
  "json.dumps(outcome, ensure_ascii=True, allow_nan=False, default=str)",
].join("\n");
self.onmessage = async (event) => {
  const { code, cases } = event.data || {};
  if (typeof code !== "string" || code.length > 24000 ||
      !Array.isArray(cases) || cases.length < 1 || cases.length > 20) {
    self.postMessage({ error: "Invalid local execution request." });
    return;
  }
  try {
    const pyodide = await (runtimePromise ??= loadPyodide({ indexURL: CDN }));
    const results = [];
    for (const test of cases) {
      pyodide.globals.set("_dsa_code", code);
      pyodide.globals.set("_dsa_input", JSON.stringify(test.input));
      const started = performance.now();
      try {
        const result = JSON.parse(await pyodide.runPythonAsync(PYTHON));
        results.push({
          id: test.id, ...result,
          durationMs: Math.round(performance.now() - started),
        });
      } catch (error) {
        results.push({
          id: test.id,
          ok: false,
          error: String(error).slice(0,4096),
          durationMs: Math.round(performance.now() - started),
        });
      }
    }
    self.postMessage({ results });
  } catch (error) {
    self.postMessage({ error: "Local Python runtime could not load: " + String(error).slice(0,200) });
  }
};
