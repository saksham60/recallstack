"use client";

import { useEffect, useRef, useState } from "react";

export type LocalTestCase = { id: string; input: unknown; expected: unknown };
export type LocalCaseResult = LocalTestCase & {
  passed: boolean;
  actual?: unknown;
  error?: string;
  stdout?: string;
  durationMs?: number;
};
export type LocalRun = {
  state: "running" | "passed" | "failed";
  source: "verified" | "examples";
  purpose: "run" | "submit";
  code: string;
  results: LocalCaseResult[];
  message?: string;
};
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return "{" + Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => JSON.stringify(key) + ":" + canonical(entry))
      .join(",") + "}";
  return JSON.stringify(value);
}
// Client-only educational execution against public inputs, never an official
// hidden-test verdict. Results are untrusted by the backend.
export function useLocalPythonRun() {
  const worker = useRef<Worker | null>(null);
  const busy = useRef(false);
  const activeCancel = useRef<(() => void) | null>(null);
  const [run, setRun] = useState<LocalRun | null>(null);
  useEffect(() => () => {
    worker.current?.terminate();
    worker.current = null;
  }, []);
  function cancel() {
    activeCancel.current?.();
  }
  async function start(
    code: string,
    cases: LocalTestCase[],
    source: "verified" | "examples",
    purpose: "run" | "submit" = "run",
  ): Promise<LocalRun> {
    if (busy.current) return {
      code, source, purpose, state: "failed", results: [],
      message: "A Python execution is already running.",
    };
    if (!code.trim() || cases.length === 0 || cases.length > 20) {
      const failed: LocalRun = {
        code, source, purpose, state: "failed", results: [],
        message: !code.trim()
          ? "Write a Python solution before running."
          : "No executable public cases are available for this version.",
      };
      setRun(failed);
      return failed;
    }
    busy.current = true;
    setRun({ code, source, purpose, state: "running", results: [] });
    if (!worker.current) {
      try {
        worker.current = new Worker("/dsa/python-worker.mjs", { type: "module" });
      } catch {
        busy.current = false;
        const failed: LocalRun = {
          code, source, purpose, state: "failed", results: [],
          message: "This browser cannot initialize the local Python worker.",
        };
        setRun(failed);
        return failed;
      }
    }
    const current = worker.current;
    return await new Promise<LocalRun>((resolve) => {
      let completed = false;
      const finish = (next: LocalRun, terminate = false) => {
        if (completed) return;
        completed = true;
        clearTimeout(timer);
        current.removeEventListener("message", onMessage);
        current.removeEventListener("error", onError);
        if (terminate) {
          current.terminate();
          if (worker.current === current) worker.current = null;
        }
        busy.current = false;
        activeCancel.current = null;
        setRun(next);
        resolve(next);
      };
      const onMessage = (event: MessageEvent) => {
        const payload = event.data as {
          error?: string;
          results?: Array<{
            id: string; ok: boolean; actual?: unknown;
            error?: string; stdout?: string; durationMs?: number;
          }>;
        };
        if (payload.error || !payload.results) {
          finish({
            code, source, purpose, state: "failed", results: [],
            message: payload.error ?? "The Python worker did not return results.",
          }, !!payload.error);
          return;
        }
        const mapped = cases.map((test, index) => {
          const response = payload.results?.[index];
          const passed = response?.id === test.id &&
            response.ok === true &&
            canonical(response.actual) === canonical(test.expected);
          return {
            ...test,
            passed,
            ...(response?.ok && Object.prototype.hasOwnProperty.call(response, "actual")
              ? { actual: response.actual } : {}),
            ...(response?.error ? { error: response.error } : {}),
            ...(response?.stdout ? { stdout: response.stdout } : {}),
            durationMs: response?.durationMs,
          };
        });
        finish({
          code, source, purpose, results: mapped,
          state: mapped.every((test) => test.passed) ? "passed" : "failed",
        });
      };
      const onError = () => finish({
        code, source, purpose, state: "failed", results: [],
        message: "The local Python worker could not load or execute.",
      }, true);
      const timer = window.setTimeout(() => finish({
        code, source, purpose, state: "failed", results: [],
        message: "Local execution exceeded the 30-second limit.",
      }, true), 30000);
      activeCancel.current = () => finish({
        code, source, purpose, state: "failed", results: [],
        message: "Local execution cancelled.",
      }, true);
      current.addEventListener("message", onMessage);
      current.addEventListener("error", onError);
      current.postMessage({ code, cases: cases.map(({ id, input }) => ({ id, input })) });
    });
  }
  return { run, start, cancel };
}
