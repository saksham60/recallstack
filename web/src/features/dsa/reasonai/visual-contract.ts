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
    description: "Create a safe, interactive DSA lesson, never executable code. Use 3–6 full state snapshots for a partial walkthrough. array displays an indexed sequence with labeled pointers; graph displays a tree/graph with nodes at percentage x/y coordinates; grid displays a small matrix or DP table. All arrays are required: use [] for scene fields irrelevant to kind. Each snapshot must contain the entire visible state, consistent IDs/positions and a short explanation of the transition. Declare any illustrative target or other assumed constants in the first snapshot and show changing quantities in variables. Set basis=illustrative unless the actual example was supplied by the user or retrieved source. Do not call an invented teaching example official. Do not reveal an unrequested complete solution. No HTML, SVG strings, scripts, URLs or code fields.",
    parameters: lessonSchema,
  },
};

/** PR6 graph tool. The legacy provider keeps its existing tool name. */
export const DSA_CREATE_VISUAL_TOOL = {
  ...DSA_VISUAL_TOOL,
  function: { ...DSA_VISUAL_TOOL.function, name: "create_visual", strict: true },
};

type Schema = { type: string; maxLength?: number; minimum?: number; maximum?: number; minItems?: number; maxItems?: number; items?: Schema; properties?: Record<string, Schema>; enum?: string[] };
function validate(value: unknown, rule: Schema): void {
  const invalid = () => { throw new Error("Invalid visual lesson."); };
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
    if (Object.keys(data).some((key) => !Object.hasOwn(rule.properties!, key))) invalid();
    for (const [key, shape] of Object.entries(rule.properties!)) validate(data[key], shape);
  }
}
export function parseVisualLesson(value: unknown): VisualLesson {
  validate(value, lessonSchema as Schema);
  const lesson = value as VisualLesson;
  if (!lesson.title.trim() || !lesson.summary.trim()) throw new Error("Empty visual lesson.");
  for (const step of lesson.steps) {
    if (!step.title.trim() || !step.explanation.trim()) throw new Error("Empty visual step.");
    if (step.highlights.some((index) => index >= step.values.length) || step.pointers.some((pointer) => pointer.index >= step.values.length)) throw new Error("Visual index out of range.");
    const ids = new Set(step.nodes.map((node) => node.id));
    if (ids.size !== step.nodes.length || step.nodes.some((node) => !node.id.trim()) || step.edges.some((edge) => !ids.has(edge.from) || !ids.has(edge.to))) throw new Error("Invalid visual connections.");
    if (step.rows.some((row) => row.length !== step.rows[0].length) || step.activeCells.some((cell) => !step.rows[cell.row] || cell.column >= step.rows[cell.row].length)) throw new Error("Invalid visual grid.");
    if (lesson.kind === "array" && (!step.values.length || step.nodes.length || step.rows.length)
      || lesson.kind === "graph" && (!step.nodes.length || step.values.length || step.rows.length)
      || lesson.kind === "grid" && (!step.rows.length || step.values.length || step.nodes.length)) throw new Error("Visual scene does not match its kind.");
  }
  return lesson;
}
