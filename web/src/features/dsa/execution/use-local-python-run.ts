"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { equal, safeJson } from "@/lib/dsa-execution/public-comparator";
import type { PythonContract } from "@/lib/dsa-execution/python-contract";
import { track } from "@/lib/telemetry/client";

export type LocalTestCase = { id: string; input: unknown; expected: unknown };
export type LocalCaseResult = LocalTestCase & { passed: boolean; actual?: unknown; error?: string; stdout?: string; durationMs?: number; status?: string };
export type RunReceipt = { userId: string; problemId: string; problemVersionId: string; language: "python"; codeSha256: string; adapterVersion: string; publicRevision: string; harnessSha256: string };
export type LocalRun = {
  state: "running" | "passed" | "failed" | "cancelled";
  phase?: "initializing" | "running" | "completed" | "failed" | "cancelled";
  source: "verified" | "examples" | "custom"; purpose: "run" | "submit"; code: string;
  results: LocalCaseResult[]; message?: string; currentCase?: number; totalCases?: number;
  initializationMs?: number; totalExecutionMs?: number; durationMs?: number; receipt?: RunReceipt;
};
export type LocalRunOptions = { contract: PythonContract; contractRevision?: string; harnessSha256?: string; publicRevision?: string; userId?: string; problemId?: string; problemVersionId?: string };
const PROVISIONAL: PythonContract = { entrypoint: "solve", inputMode: "single", checker: "exact_json" };
const INITIALIZATION_LIMIT_MS = 60000, CASE_LIMIT_MS = 3000, RUN_LIMIT_MS = 120000;

type WorkerResult = { id: string; status: string; actual?: unknown; stderr?: string; stdout?: string; durationMs?: number };
function createWorker() { return new Worker("/dsa/python-worker.mjs", { type: "module", name: "reasonai-local-python" }); }

export function useLocalPythonRun(telemetryProblemId?: string) {
  const idle = useRef<Worker | null>(null), active = useRef<Worker | null>(null);
  const busy = useRef(false), serial = useRef(0), activeCancel = useRef<(() => void) | null>(null);
  const [run, setRun] = useState<LocalRun | null>(null);
  const cancel = useCallback(() => { activeCancel.current?.(); }, []);
  const invalidate = useCallback(() => { serial.current++; activeCancel.current?.(); setRun(null); }, []);
  useEffect(() => () => {
    serial.current++; activeCancel.current?.(); active.current?.terminate(); idle.current?.terminate(); idle.current = null;
  }, []);
  function prewarm() {
    try {
      const worker = createWorker(); idle.current = worker;
      worker.onerror = (event) => { event.preventDefault(); worker.terminate(); if (idle.current === worker) idle.current = null; };
      worker.postMessage({ action: "initialize" });
    } catch { /* Initialization diagnostics appear on the next explicit Run. */ }
  }
  async function start(code: string, cases: LocalTestCase[], source: "verified" | "examples" | "custom", purpose: "run" | "submit" = "run", options?: LocalRunOptions): Promise<LocalRun> {
    if (busy.current) return { code, source, purpose, state: "failed", results: [], message: "A Python execution is already running." };
    const failed = (message: string): LocalRun => ({ code, source, purpose, state: "failed", phase: "failed", results: [], message });
    if (!code.trim() || code.length > 24000 || !cases.length || cases.length > 100 || !cases.every((test) => safeJson(test.input) && safeJson(test.expected)) || new TextEncoder().encode(JSON.stringify(cases.map((t) => t.input))).byteLength > 65536) {
      const result = failed(!code.trim() ? "Write a Python solution before running." : "Public inputs are missing or exceed supported execution limits."); setRun(result); return result;
    }
    if (source === "verified" && (!options?.harnessSha256 || !options.publicRevision)) { const result = failed("The certified runner contract is not loaded. Refresh and try again."); setRun(result); return result; }
    busy.current = true;
    track("dsa.local_run_started", { purpose, test_source: source }, options?.problemId ?? telemetryProblemId);
    const current = ++serial.current, started = performance.now(), contract = options?.contract ?? PROVISIONAL;
    let failurePhase: "initialization" | "execution" = "initialization";
    let cancelled = false, terminateCase: (() => void) | undefined, initializationMs = 0;
    const results: LocalCaseResult[] = [];
    const update = (state: Partial<LocalRun>) => { if (serial.current === current) setRun({ code, source, purpose, state: "running", results: [...results], totalCases: cases.length, initializationMs, ...state }); };
    activeCancel.current = () => { cancelled = true; terminateCase?.(); };
    const wholeTimer = window.setTimeout(() => { terminateCase?.(); }, RUN_LIMIT_MS);
    let codeSha256 = "";
    try {
      update({ phase: "initializing", currentCase: 1 });
      codeSha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code))), (n) => n.toString(16).padStart(2, "0")).join("");
      for (let index = 0; index < cases.length; index++) {
        if (cancelled || serial.current !== current) throw new Error("Local Run cancelled.");
        if (performance.now() - started > RUN_LIMIT_MS) throw new Error("The whole-run execution budget was exceeded.");
        const test = cases[index];
        failurePhase = "initialization";
        update({ phase: "initializing", currentCase: index + 1 });
        const worker = idle.current ?? createWorker(); idle.current = null; active.current = worker;
        const response = await new Promise<{ result: WorkerResult; initializationMs: number }>((resolve, reject) => {
          let complete = false, timer: number, initialized = 0;
          const finish = (error?: Error, result?: WorkerResult) => {
            if (complete) return; complete = true; window.clearTimeout(timer);
            worker.removeEventListener("message", message); worker.removeEventListener("error", errorEvent);
            worker.terminate(); if (active.current === worker) active.current = null;
            terminateCase = undefined;
            if (error) reject(error); else resolve({ result: result!, initializationMs: initialized });
          };
          const arm = (ms: number, text: string) => { window.clearTimeout(timer); timer = window.setTimeout(() => finish(new Error(text)), ms); };
          const message = (event: MessageEvent) => {
            const data = event.data;
            if (data.phase === "ready") return;
            if (options?.harnessSha256 && data.harnessSha256 !== options.harnessSha256) { finish(new Error("The Python harness changed. Reload the workspace before running again.")); return; }
            if (data.error) { finish(new Error(data.error)); return; }
            if (data.phase === "initializing") return;
            if (data.phase === "running") {
              failurePhase = "execution";
              initialized = typeof data.initializationMs === "number" ? data.initializationMs : 0;
              update({ phase: "running", currentCase: index + 1 });
              arm(CASE_LIMIT_MS, `Timeout: case ${index + 1} exceeded the 3-second execution budget.`); return;
            }
            const row = data.results?.[0] as WorkerResult | undefined;
            if (!row || data.results.length !== 1 || row.id !== test.id) { finish(new Error("The Python worker returned an invalid case result.")); return; }
            finish(undefined, row);
          };
          const errorEvent = (event: ErrorEvent) => { event.preventDefault(); finish(new Error("Python worker initialization failed. Check runtime downloads, browser CSP/WASM support and network access.")); };
          terminateCase = () => finish(new Error(cancelled ? "Local Run cancelled." : "The whole-run budget was exceeded."));
          worker.addEventListener("message", message); worker.addEventListener("error", errorEvent);
          arm(INITIALIZATION_LIMIT_MS, "Python initialization timed out. Check the pinned runtime download and retry.");
          worker.postMessage({ code, contract, cases: [{ id: test.id, input: test.input }] });
        });
        initializationMs += response.initializationMs;
        let row = response.result;
        if (row.status === "ok" && (!safeJson(row.actual) || new TextEncoder().encode(JSON.stringify(row.actual)).byteLength > 16384)) row = { id: test.id, status: "runtime_error", stderr: "Unsupported serialization: return a bounded JSON-compatible value." };
        const passed = row.status === "ok" && (source === "custom" || equal(row.actual, test.expected, contract, test.input));
        results.push({ ...test, passed, status: row.status, ...(Object.hasOwn(row, "actual") ? { actual: row.actual } : {}), ...(row.stderr ? { error: row.stderr } : {}), ...(row.stdout ? { stdout: row.stdout } : {}), durationMs: row.durationMs });
        update({ phase: "running", currentCase: index + 1 });
      }
      const passed = results.every((result) => result.passed);
      const receipt = passed && source === "verified" && options?.userId && options.problemId && options.problemVersionId && options.publicRevision && options.harnessSha256 ? { userId: options.userId, problemId: options.problemId, problemVersionId: options.problemVersionId, language: "python" as const, codeSha256, adapterVersion: contract.adapter ? `${contract.adapter.id}:${contract.adapter.version}:${options.contractRevision}` : "legacy-function:1", publicRevision: options.publicRevision, harnessSha256: options.harnessSha256 } : undefined;
      const next: LocalRun = { code, source, purpose, state: passed ? "passed" : "failed", phase: "completed", results, totalCases: cases.length, currentCase: cases.length, initializationMs, totalExecutionMs: results.reduce((sum, row) => sum + (row.durationMs ?? 0), 0), durationMs: Math.round(performance.now() - started), ...(receipt ? { receipt } : {}) };
      if (serial.current === current) { setRun(next); prewarm(); }
      track("dsa.local_run_completed", { duration_ms: Math.min(600000, next.durationMs ?? 0), initialization_ms: Math.min(600000, Math.round(initializationMs)), passed: results.filter(r => r.passed).length, total: results.length, outcome: next.state === "passed" ? "passed" : "failed", test_source: source }, options?.problemId ?? telemetryProblemId);
      return next;
    } catch (error) {
      const next: LocalRun = { code, source, purpose, state: cancelled ? "cancelled" : "failed", phase: cancelled ? "cancelled" : "failed", results, initializationMs, durationMs: Math.round(performance.now() - started), message: error instanceof Error ? error.message : "Local Python could not complete." };
      if (serial.current === current) setRun(next);
      track("dsa.local_run_failed", { category: cancelled ? "cancelled" : failurePhase, duration_ms: Math.min(600000, next.durationMs ?? 0) }, options?.problemId ?? telemetryProblemId);
      return next;
    } finally { window.clearTimeout(wholeTimer); active.current?.terminate(); active.current = null; activeCancel.current = null; busy.current = false; }
  }
  return { run, start, cancel, invalidate };
}
