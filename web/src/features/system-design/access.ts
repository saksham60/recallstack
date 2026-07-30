export function canAccessSystemDesign(
  roles: readonly string[] | null | undefined,
  enabled: boolean,
): boolean {
  return enabled && (roles?.includes("admin") ?? false);
}
