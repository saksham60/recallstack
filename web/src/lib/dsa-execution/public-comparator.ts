import type { PythonContract } from "./python-contract";

export function safeJson(value: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value));
  if (Array.isArray(value)) return value.every((v) => safeJson(v, depth + 1));
  return !!value && typeof value === "object" && Object.values(value).every((v) => safeJson(v, depth + 1));
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function numeric(actual: unknown, expected: unknown, absolute: number, relative: number): boolean {
  if (typeof actual === "number" && typeof expected === "number") return Math.abs(actual - expected) <= absolute + relative * Math.abs(expected);
  if (Array.isArray(actual) && Array.isArray(expected)) return actual.length === expected.length && actual.every((v, i) => numeric(v, expected[i], absolute, relative));
  if (actual && expected && typeof actual === "object" && typeof expected === "object" && !Array.isArray(actual) && !Array.isArray(expected)) {
    const a = actual as Record<string, unknown>, e = expected as Record<string, unknown>;
    return Object.keys(a).length === Object.keys(e).length && Object.keys(e).every((key) => Object.hasOwn(a, key) && numeric(a[key], e[key], absolute, relative));
  }
  return canonical(actual) === canonical(expected);
}
/** Approved fixed checker registry. This code never evaluates a supplied checker. */
export function equal(actual: unknown, expected: unknown, contract: PythonContract, input?: unknown): boolean {
  if (!safeJson(actual) || !safeJson(expected)) return false;
  if (contract.checker === "numeric") return typeof actual === "number" && typeof expected === "number" && Math.abs(actual - expected) <= contract.absoluteTolerance!;
  if (contract.checker === "numeric_json") return numeric(actual, expected, contract.absoluteTolerance!, contract.relativeTolerance ?? 0);
  if (contract.checker === "unordered_json") return Array.isArray(actual) && Array.isArray(expected) && canonical(actual.map(canonical).sort()) === canonical(expected.map(canonical).sort());
  if (contract.checker === "unordered_triplets") {
    const normalize = (value: unknown) => Array.isArray(value) && value.every((v) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number")) ? value.map((v: number[]) => canonical([...v].sort((a, b) => a - b))).sort() : null;
    const a = normalize(actual), e = normalize(expected);
    return a !== null && e !== null && canonical(a) === canonical(e);
  }
  if (contract.checker === "two_sum_indices") {
    const fixture = input as { nums?: unknown; target?: unknown } | undefined;
    const nums = fixture?.nums, target = fixture?.target;
    return Array.isArray(nums) && typeof target === "number" && Array.isArray(actual) && actual.length === 2 && actual.every((v) => Number.isInteger(v) && v >= 0 && v < nums.length) && actual[0] !== actual[1] && typeof nums[actual[0]] === "number" && typeof nums[actual[1]] === "number" && nums[actual[0]] + nums[actual[1]] === target;
  }
  if (contract.checker === "topological_order") {
    const fixture = input as { numCourses?: number; prerequisites?: number[][] } | undefined;
    if (!fixture || !Number.isInteger(fixture.numCourses) || fixture.numCourses! < 0 || fixture.numCourses! > 10000 || !Array.isArray(fixture.prerequisites) || !Array.isArray(actual) || fixture.prerequisites.some((edge) => !Array.isArray(edge) || edge.length !== 2 || edge.some((n) => !Number.isInteger(n) || n < 0 || n >= fixture.numCourses!))) return false;
    if (!actual.length && fixture.numCourses! > 0) {
      const indegree = Array<number>(fixture.numCourses!).fill(0), outgoing = Array.from({ length: fixture.numCourses! }, () => [] as number[]);
      for (const [course, prerequisite] of fixture.prerequisites) { indegree[course]++; outgoing[prerequisite].push(course); }
      const queue = indegree.flatMap((n, index) => n === 0 ? [index] : []);
      for (let i = 0; i < queue.length; i++) for (const n of outgoing[queue[i]]) if (--indegree[n] === 0) queue.push(n);
      return queue.length < fixture.numCourses!;
    }
    if (actual.length !== fixture.numCourses || new Set(actual).size !== actual.length || actual.some((n) => !Number.isInteger(n) || n < 0 || n >= fixture.numCourses!)) return false;
    const positions = new Map(actual.map((n, i) => [n, i]));
    return fixture.prerequisites.every((edge) => Array.isArray(edge) && edge.length === 2 && positions.has(edge[0]) && positions.has(edge[1]) && positions.get(edge[1])! < positions.get(edge[0])!);
  }
  return canonical(actual) === canonical(expected);
}
