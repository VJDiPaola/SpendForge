export type RedactedJsonShape =
  | { type: "null" | "string" | "number" | "boolean" }
  | { type: "array"; items: RedactedJsonShape[] }
  | {
      type: "object";
      fields: Array<{ name: string; shape: RedactedJsonShape }>;
    }
  | { type: "truncated" | "non_json" };

function shapeSignature(shape: RedactedJsonShape): string {
  return JSON.stringify(shape);
}

function safeFieldName(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(name) &&
    !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(name)
    ? name
    : "[redacted-field]";
}

/** Returns JSON field names, nesting, and primitive types without values. */
export function describeJsonShape(
  value: unknown,
  depth = 0,
): RedactedJsonShape {
  if (depth >= 8) {
    return { type: "truncated" };
  }
  if (value === null) {
    return { type: "null" };
  }
  if (Array.isArray(value)) {
    const unique = new Map<string, RedactedJsonShape>();
    for (const item of value.slice(0, 20)) {
      const shape = describeJsonShape(item, depth + 1);
      unique.set(shapeSignature(shape), shape);
    }
    return { type: "array", items: [...unique.values()] };
  }
  if (typeof value === "object") {
    const fields = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, 100)
      .map(([name, fieldValue]) => ({
        name: safeFieldName(name),
        shape: describeJsonShape(fieldValue, depth + 1),
      }));
    return { type: "object", fields };
  }
  if (typeof value === "string") {
    return { type: "string" };
  }
  if (typeof value === "number") {
    return { type: "number" };
  }
  if (typeof value === "boolean") {
    return { type: "boolean" };
  }
  return { type: "non_json" };
}
