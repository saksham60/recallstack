import { z } from "zod";
import { executionIdentity, reply } from "@/lib/dsa-execution/http";
import { readBoundedJSON } from "@/lib/http/read-bounded-json";
import {
  boardLayoutSchema,
  emptyLayout,
} from "@/features/dsa/navigation/contracts";

export const runtime = "nodejs";
type Context = { params: Promise<{ categoryId: string }> };
const changeSchema = z
  .object({
    rowVersion: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    layout: boardLayoutSchema,
  })
  .strict();
const unavailable = () =>
  reply(
    {
      error:
        "Personal board storage is not available. The Supabase V3 migration must be reviewed and installed.",
      code: "BOARD_STORAGE_UNAVAILABLE",
    },
    503,
  );

export async function GET(request: Request, context: Context) {
  const identity = await executionIdentity(request);
  if (identity instanceof Response) return identity;
  const { categoryId } = await context.params;
  if (!z.uuid().safeParse(categoryId).success)
    return reply({ error: "Invalid category." }, 422);
  const { data, error } = await identity.supabase
    .from("dsa_personal_boards")
    .select("row_version,layout")
    .eq("user_id", identity.user.id)
    .eq("category_id", categoryId)
    .maybeSingle();
  if (error) return unavailable();
  if (!data) return reply({ categoryId, rowVersion: 0, layout: emptyLayout() });
  const layout = boardLayoutSchema.safeParse(data.layout);
  return layout.success
    ? reply({ categoryId, rowVersion: data.row_version, layout: layout.data })
    : unavailable();
}

export async function PUT(request: Request, context: Context) {
  const identity = await executionIdentity(request);
  if (identity instanceof Response) return identity;
  const { categoryId } = await context.params;
  if (!z.uuid().safeParse(categoryId).success)
    return reply({ error: "Invalid category." }, 422);
  let raw: unknown;
  try {
    raw = await readBoundedJSON(request, 65536);
  } catch (error) {
    if (error instanceof Error && error.message === "Body too large.") return reply({ error: "Board is too large." }, 413);
    return reply({ error: "Invalid JSON." }, 400);
  }
  const parsed = changeSchema.safeParse(raw);
  if (!parsed.success)
    return reply({ error: "Invalid personal arrangement." }, 422);
  const { rowVersion, layout } = parsed.data;
  const table = identity.supabase.from("dsa_personal_boards");
  const result =
    rowVersion === 0
      ? await table
          .insert({
            user_id: identity.user.id,
            category_id: categoryId,
            layout,
            row_version: 1,
          })
          .select("row_version")
          .maybeSingle()
      : await table
          .update({ layout, row_version: rowVersion + 1 })
          .eq("user_id", identity.user.id)
          .eq("category_id", categoryId)
          .eq("row_version", rowVersion)
          .select("row_version")
          .maybeSingle();
  if (result.error?.code === "23505" || (!result.error && !result.data))
    return reply(
      {
        error:
          "This arrangement changed in another session. Reload the saved arrangement before retrying.",
      },
      409,
    );
  if (result.error) return unavailable();
  return reply({ categoryId, rowVersion: result.data!.row_version, layout });
}
