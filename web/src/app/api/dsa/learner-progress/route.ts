import { createClient } from "@supabase/supabase-js";
import { executionIdentity, reply } from "@/lib/dsa-execution/http";
import { publicConfig } from "@/lib/config/public";
import { learnerProgressSchema } from "@/features/dsa/progress/contract";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const identity = await executionIdentity(request);
  if (identity instanceof Response) return identity;
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error("Storage unavailable");
    const client = createClient(publicConfig.supabaseUrl, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    // Identity is verified above. No request parameter can select another owner.
    const { data, error } = await client
      .rpc("dsa_learner_execution_progress", { p_user_id: identity.user.id })
      .abortSignal(AbortSignal.timeout(8000));
    if (error) throw error;
    return reply(learnerProgressSchema.parse({ items: data }));
  } catch {
    return reply(
      { error: "Saved problem progress is temporarily unavailable." },
      503,
    );
  }
}
