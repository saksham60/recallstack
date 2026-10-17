// One learner test per Worker/interpreter. An idle prewarmed worker has never
// executed learner code. Expected outputs NEVER enter this worker.
import { HARNESS_SOURCE, HARNESS_SHA256 } from "./runner-harness.mjs";
const CDN = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";
let runtimePromise;
let used = false;
function runtime() {
  return runtimePromise ??= import(CDN + "pyodide.mjs").then(({ loadPyodide }) => loadPyodide({ indexURL: CDN }));
}
self.onmessage = async (event) => {
  const { action, code, cases, contract } = event.data || {};
  if (action === "initialize") {
    try { await runtime(); self.postMessage({ phase: "ready", harnessSha256: HARNESS_SHA256 }); }
    catch (error) { self.postMessage({ phase: "initialization_error", error: String(error).slice(0, 500), harnessSha256: HARNESS_SHA256 }); }
    return;
  }
  if (used || typeof code !== "string" || code.length > 24000 || !Array.isArray(cases) || cases.length !== 1 || !contract) {
    self.postMessage({ error: "Invalid or reused local execution worker." }); return;
  }
  used = true;
  try {
    self.postMessage({ phase: "initializing", harnessSha256: HARNESS_SHA256 });
    const initialized = performance.now();
    const pyodide = await runtime();
    await pyodide.runPythonAsync(HARNESS_SOURCE);
    const initializationMs = Math.round(performance.now() - initialized);
    pyodide.globals.set("_dsa_code", code);
    pyodide.globals.set("_dsa_input", JSON.stringify(cases[0].input));
    pyodide.globals.set("_dsa_contract", JSON.stringify(contract));
    self.postMessage({ phase: "running", initializationMs, harnessSha256: HARNESS_SHA256 });
    const started = performance.now();
    const result = JSON.parse(await pyodide.runPythonAsync("json.dumps(run_case(_dsa_code, json.loads(_dsa_contract), json.loads(_dsa_input)), ensure_ascii=False, allow_nan=False)"));
    self.postMessage({ harnessSha256: HARNESS_SHA256, initializationMs, results: [{ id: cases[0].id, ...result, durationMs: Math.round(performance.now() - started) }] });
  } catch (error) {
    self.postMessage({ error: "Python initialization or worker failure: " + String(error).slice(0, 500), harnessSha256: HARNESS_SHA256 });
  }
};
