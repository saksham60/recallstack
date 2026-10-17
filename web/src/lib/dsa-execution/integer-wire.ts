/** Versioned lossless JSON integer transport. This key is reserved by tagged-v1. */
export const INTEGER_KEY = "$reasonaiInteger";
export function wireInteger(value: unknown): bigint | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value))
    return BigInt(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const row = value as Record<string, unknown>,
    text = row[INTEGER_KEY];
  if (
    Object.keys(row).length !== 1 ||
    typeof text !== "string" ||
    text.length > 1000 ||
    !/^-?(0|[1-9][0-9]*)$/.test(text) ||
    text === "-0"
  )
    return;
  const integer = BigInt(text);
  if (
    integer > BigInt("9007199254740991") ||
    integer < -BigInt("9007199254740991")
  )
    return integer;
}
export function displayJson(value: unknown, depth = 0): string {
  const integer = wireInteger(value);
  if (integer !== undefined) return integer.toString();
  if (!value || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  const indent = "  ".repeat(depth + 1),
    end = "  ".repeat(depth);
  if (Array.isArray(value))
    return value.length
      ? `[\n${value.map((v) => indent + displayJson(v, depth + 1)).join(",\n")}\n${end}]`
      : "[]";
  const entries = Object.entries(value);
  return entries.length
    ? `{\n${entries.map(([k, v]) => indent + JSON.stringify(k) + ": " + displayJson(v, depth + 1)).join(",\n")}\n${end}}`
    : "{}";
}
