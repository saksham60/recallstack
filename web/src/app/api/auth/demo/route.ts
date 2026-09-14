import { createClient } from "@/lib/supabase/server";
import { handleDemoLogin } from "./handler";

export async function POST(request: Request) {
  return handleDemoLogin(request, {
    enabled: process.env.DEMO_ACCESS_ENABLED === "1",
    email: process.env.DEMO_EMAIL,
    password: process.env.DEMO_PASSWORD,
    signInWithPassword: async (credentials) => {
      const supabase = await createClient();
      return supabase.auth.signInWithPassword(credentials);
    },
  });
}
