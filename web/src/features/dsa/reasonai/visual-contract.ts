export interface VisualStep {
  title: string;
  explanation: string;
  values: string[];
  highlights: number[];
  pointers: { label: string; index: number }[];
  nodes: { id: string; label: string; x: number; y: number; state: "default" | "active" | "visited" }[];
  edges: { from: string; to: string; label: string }[];
  rows: string[][];
  activeCells: { row: number; column: number }[];
  variables: { name: string; value: string }[];
}
export interface VisualLesson {
  title: string;
  summary: string;
  kind: "array" | "graph" | "grid";
  basis: "illustrative" | "user_example" | "source_example";
  steps: VisualStep[];
}

const str = (maxLength: number) => ({ type: "string", maxLength });
const integer = (maximum: number) => ({ type: "integer", minimum: 0, maximum });
const array = (items: object, maxItems: number, minItems = 0) => ({ type: "array", items, maxItems, minItems });
const object = (properties: Record<string, object>) => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });
const stepSchema = object({
  title: str(100), explanation: str(700), values: array(str(60), 16), highlights: array(integer(15), 16),
  pointers: array(object({ label: str(30), index: integer(15) }), 4),
  nodes: array(object({ id: str(40), label: str(40), x: integer(100), y: integer(100), state: { type: "string", enum: ["default", "active", "visited"] } }), 12),
  edges: array(object({ from: str(40), to: str(40), label: str(40) }), 24),
  rows: array(array(str(40), 8, 1), 8), activeCells: array(object({ row: integer(7), column: integer(7) }), 64),
  variables: array(object({ name: str(40), value: str(100) }), 6),
});
const lessonSchema = object({
  title: str(120), summary: str(1200), kind: { type: "string", enum: ["array", "graph", "grid"] },
  basis: { type: "string", enum: ["illustrative", "user_example", "source_example"] }, steps: array(stepSchema, 12, 1),
});
export const DSA_VISUAL_TOOL = {
  type: "function",
  function: {
    name: "present_visual_lesson",
    description: "Create a safe DSA lesson with 3–6 complete snapshots, never executable code. Every step has values, highlights, pointers, nodes, edges, rows, activeCells and variables arrays; use [] when unused. For array: values must be nonempty; nodes, edges, rows and activeCells are []; pointer/highlight indexes must exist in values. For graph: nodes must be nonempty; values, highlights, pointers, rows and activeCells are []; every edge refers to existing node IDs. For grid: rows must be nonempty and rectangular; values, highlights, pointers, nodes and edges are []; activeCells must be in bounds. Keep IDs and positions consistent. Declare illustrative constants in the first step. Use basis=illustrative unless the user supplied the example or search returned actual evidence. No HTML, SVG, scripts, URLs, code or full unrequested solution.",
    parameters: lessonSchema,
  },
};

/** PR6 graph tool. The legacy provider keeps its existing tool name. */
export const DSA_CREATE_VISUAL_TOOL = {
  ...DSA_VISUAL_TOOL,
  function: { ...DSA_VISUAL_TOOL.function, name: "create_visual", strict: true },
};

export type VisualValidationCode = "VISUAL_MISSING_FIELD" | "VISUAL_INDEX_OUT_OF_RANGE" | "VISUAL_INVALID_EDGE" | "VISUAL_GRID_DIMENSION_INVALID" | "VISUAL_KIND_MISMATCH" | "VISUAL_UNSAFE_FIELD" | "VISUAL_INVALID_PAYLOAD";
export class VisualValidationError extends Error {
  constructor(readonly code: VisualValidationCode) { super(code); }
}
type Schema = { type: string; maxLength?: number; minimum?: number; maximum?: number; minItems?: number; maxItems?: number; items?: Schema; properties?: Record<string, Schema>; enum?: string[] };
function validate(value: unknown, rule: Schema): void {
  const invalid = (code: VisualValidationCode = "VISUAL_INVALID_PAYLOAD") => { throw new VisualValidationError(code); };
  if (value === undefined) invalid("VISUAL_MISSING_FIELD");
  if (rule.type === "string") {
    if (typeof value !== "string" || value.length > rule.maxLength! || rule.enum && !rule.enum.includes(value)) invalid();
  } else if (rule.type === "integer") {
    if (!Number.isInteger(value) || Number(value) < rule.minimum! || Number(value) > rule.maximum!) invalid();
  } else if (rule.type === "array") {
    if (!Array.isArray(value) || value.length < rule.minItems! || value.length > rule.maxItems!) invalid();
    for (const item of value as unknown[]) validate(item, rule.items!);
  } else {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
    const data = value as Record<string, unknown>;
    if (Object.keys(data).some((key) => !Object.hasOwn(rule.properties!, key))) invalid("VISUAL_UNSAFE_FIELD");
    for (const [key, shape] of Object.entries(rule.properties!)) validate(data[key], shape);
  }
}
export function parseVisualLesson(value: unknown): VisualLesson {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  const kind = input?.kind;
  const primary = kind === "array" ? "values" : kind === "graph" ? "nodes" : kind === "grid" ? "rows" : undefined;
  const steps = input?.steps;
  const normalized = primary && Array.isArray(steps) ? {
    ...input,
    steps: steps.map((step) => {
      if (!step || typeof step !== "object" || Array.isArray(step)) return step;
      const fields = step as Record<string, unknown>;
      return Object.fromEntries([...Object.entries(fields), ...["values", "highlights", "pointers", "nodes", "edges", "rows", "activeCells", "variables"]
        .filter((name) => name !== primary && !Object.hasOwn(fields, name)).map((name) => [name, []])]);
    }),
  } : value;
  validate(normalized, lessonSchema as Schema);
  const lesson = normalized as VisualLesson;
  if (!lesson.title.trim() || !lesson.summary.trim()) throw new VisualValidationError("VISUAL_INVALID_PAYLOAD");
  for (const step of lesson.steps) {
    if (!step.title.trim() || !step.explanation.trim()) throw new VisualValidationError("VISUAL_INVALID_PAYLOAD");
    if (step.highlights.some((index) => index >= step.values.length) || step.pointers.some((pointer) => pointer.index >= step.values.length)) throw new VisualValidationError("VISUAL_INDEX_OUT_OF_RANGE");
    const ids = new Set(step.nodes.map((node) => node.id));
    if (ids.size !== step.nodes.length || step.nodes.some((node) => !node.id.trim()) || step.edges.some((edge) => !ids.has(edge.from) || !ids.has(edge.to))) throw new VisualValidationError("VISUAL_INVALID_EDGE");
    if (step.rows.some((row) => row.length !== step.rows[0].length) || step.activeCells.some((cell) => !step.rows[cell.row] || cell.column >= step.rows[cell.row].length)) throw new VisualValidationError("VISUAL_GRID_DIMENSION_INVALID");
    if (lesson.kind === "array" && (!step.values.length || step.nodes.length || step.rows.length)
      || lesson.kind === "graph" && (!step.nodes.length || step.values.length || step.rows.length)
      || lesson.kind === "grid" && (!step.rows.length || step.values.length || step.nodes.length)) throw new VisualValidationError("VISUAL_KIND_MISMATCH");
  }
  return lesson;
}
