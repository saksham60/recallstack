export function canAccessSystemDesign(
  _roles: readonly string[] | null | undefined,
  enabled: boolean,
): boolean {
  return enabled;
}
