const DEFAULT_API_BASE_URL = "http://localhost:8080";

function requirePublicValue(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }

  return value;
}

export const publicConfig = Object.freeze({
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL,
  supabaseUrl: requirePublicValue(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  supabaseAnonKey: requirePublicValue(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
});
