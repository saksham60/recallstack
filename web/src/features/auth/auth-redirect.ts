export const POST_AUTH_REDIRECT_COOKIE = "reasonai-post-auth-redirect";

export function getSafeAuthRedirect(
  value: string | null | undefined,
  fallback = "/dsa",
): string {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return fallback;
  }

  return value;
}
