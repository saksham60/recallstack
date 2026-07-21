export function getSupabaseAuthCookieName(supabaseUrl: string): string {
  const hostname = new URL(supabaseUrl).hostname;
  return `sb-${hostname.split(".")[0]}-auth-token`;
}
