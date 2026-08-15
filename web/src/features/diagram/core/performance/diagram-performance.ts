type DiagramPerformanceCounters = Record<string, number>;

const counters: DiagramPerformanceCounters = {};

/** Lightweight development-only counters for finding canvas rerender hot spots. */
export function recordDiagramRender(component: "canvas" | "shape" | "connector"): void {
  if (process.env.NODE_ENV === "production") return;
  counters[component] = (counters[component] ?? 0) + 1;
}

export function readDiagramPerformanceCounters(): Readonly<DiagramPerformanceCounters> {
  return { ...counters };
}

export function resetDiagramPerformanceCounters(): void {
  for (const key of Object.keys(counters)) delete counters[key];
}
