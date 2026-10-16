import { z } from "zod";

export const laneNames = ["easy", "medium", "hard"] as const;
const ids = z
  .array(z.uuid())
  .max(1000)
  .refine((v) => new Set(v).size === v.length, "Duplicate problem IDs");
export const boardLayoutSchema = z
  .object({
    schema: z.literal(1),
    lanes: z.object({ easy: ids, medium: ids, hard: ids }).strict(),
    collections: z
      .array(
        z
          .object({
            id: z.uuid(),
            title: z.string().trim().min(1).max(80),
            problemIds: ids,
          })
          .strict(),
      )
      .max(30),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.collections.map((c) => c.id)).size === v.collections.length,
    "Duplicate collections",
  );
export const boardSchema = z.object({
  categoryId: z.uuid(),
  rowVersion: z.number().int().nonnegative(),
  layout: boardLayoutSchema,
});
export type BoardLayout = z.infer<typeof boardLayoutSchema>;
export type PersonalBoard = z.infer<typeof boardSchema>;
export const emptyLayout = (): BoardLayout => ({
  schema: 1,
  lanes: { easy: [], medium: [], hard: [] },
  collections: [],
});
export function laneFor(
  difficulty: string | null,
): (typeof laneNames)[number] | null {
  return difficulty === "beginner" || difficulty === "easy"
    ? "easy"
    : difficulty === "expert" || difficulty === "hard"
      ? "hard"
      : difficulty === "medium"
        ? "medium"
        : null;
}

// Insert relative to the target in the FULL saved order, preserving filtered cards.
export function reorder(ids: string[], source: string, target: string) {
  if (source === target || !ids.includes(source) || !ids.includes(target))
    return ids;
  const next = ids.filter((id) => id !== source);
  next.splice(next.indexOf(target), 0, source);
  return next;
}
