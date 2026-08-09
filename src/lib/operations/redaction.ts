import { createHash } from "node:crypto";

import {
  maskedReferenceSchema,
  safeResponseShapeSchema,
  type MaskedReference,
  type ResponseJsonType,
  type SafeResponseShape,
} from "./schemas";

const sensitiveKeyPattern = /(?:^|[-_])(authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|session[-_]?id|cookie|set[-_]?cookie|private[-_]?key|secret|password|passphrase|pan|card[-_]?number|cvc|cvv|raw[-_]?provider|request[-_]?body|response[-_]?body|payload)(?:$|[-_])/i;
const safeShapeKeyPattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const bearerPattern = /\b(?:bearer|basic)\s+[A-Za-z0-9._~+\/-]+=*/i;
const privateKeyPattern = /(?:^|[^A-Za-z0-9])0x[a-fA-F0-9]{64}(?:$|[^A-Za-z0-9])/;
const pemPrivateKeyPattern = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;
const commonSecretPrefixPattern = /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}\b/;

function isSensitiveKey(key: string): boolean {
  return sensitiveKeyPattern.test(key.replace(/([a-z])([A-Z])/g, "$1_$2"));
}

function passesLuhn(candidate: string): boolean {
  let sum = 0;
  let doubleDigit = false;

  for (let index = candidate.length - 1; index >= 0; index -= 1) {
    let digit = Number(candidate[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }

  return sum % 10 === 0;
}

function containsPan(value: string): boolean {
  const candidates = value.match(/(?:\d[ -]?){13,19}/g) ?? [];
  return candidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && passesLuhn(digits);
  });
}

function assertSafeString(value: string, path: string): void {
  if (
    bearerPattern.test(value) ||
    privateKeyPattern.test(value) ||
    pemPrivateKeyPattern.test(value) ||
    commonSecretPrefixPattern.test(value) ||
    containsPan(value)
  ) {
    throw new Error(`${path} contains secret or payment-card shaped data`);
  }
}

/**
 * Defense in depth for anything crossing a log, API, or UI boundary. Domain
 * schemas remain the primary allowlist; this scanner catches accidental secret
 * values and forbidden raw-body fields before serialization.
 */
export function assertUiSafePayload(
  value: unknown,
  path = "payload",
  ancestors = new Set<object>(),
): void {
  if (value === null || typeof value === "boolean") return;

  if (typeof value === "string") {
    assertSafeString(value, path);
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} contains a non-finite number`);
    }
    return;
  }

  if (typeof value !== "object") {
    throw new Error(`${path} contains a non-JSON value`);
  }

  if (ancestors.has(value)) {
    throw new Error(`${path} contains a circular reference`);
  }
  ancestors.add(value);

  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      assertUiSafePayload(child, `${path}[${index}]`, ancestors),
    );
    ancestors.delete(value);
    return;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${path} must contain plain JSON objects only`);
  }

  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      throw new Error(`${path}.${key} is not allowed in redacted evidence`);
    }
    assertUiSafePayload(child, `${path}.${key}`, ancestors);
  }
  ancestors.delete(value);
}

function sanitizeReferenceFragment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "");
}

/**
 * Accepts a transient provider identifier and immediately produces a bounded,
 * display-safe reference. Callers must discard the raw identifier after use.
 */
export function maskProviderReference(
  kind: string,
  transientRawId: string,
): MaskedReference {
  const safeKind = kind.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,31}$/.test(safeKind)) {
    throw new Error("Reference kind is invalid");
  }
  if (transientRawId.length === 0 || transientRawId.length > 512) {
    throw new Error("Transient provider reference is invalid");
  }

  const compact = sanitizeReferenceFragment(transientRawId);
  const masked =
    compact.length >= 8
      ? `${safeKind}:${compact.slice(0, 4)}...${compact.slice(-4)}`
      : `${safeKind}:sha256:${createHash("sha256")
          .update(transientRawId, "utf8")
          .digest("hex")
          .slice(0, 16)}`;

  return maskedReferenceSchema.parse(masked);
}

function jsonType(value: unknown): ResponseJsonType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  return "object";
}

/**
 * Converts a transient response to names-and-types-only evidence. It never
 * copies a response value, and sensitive/unsafe field names are omitted.
 */
export function captureResponseShape(value: unknown): SafeResponseShape {
  const fields: SafeResponseShape["fields"] = [];
  const seenFields = new Set<string>();
  const ancestors = new Set<object>();
  let omittedSensitiveFieldCount = 0;
  let truncated = false;

  const addField = (path: string, type: ResponseJsonType) => {
    if (fields.length >= 100) {
      truncated = true;
      return;
    }
    const key = `${path}:${type}`;
    if (!seenFields.has(key)) {
      fields.push({ path, type });
      seenFields.add(key);
    }
  };

  const visit = (current: unknown, path: string, depth: number): void => {
    if (depth > 6) {
      truncated = true;
      return;
    }

    if (current === null || typeof current !== "object") {
      if (path) addField(path, jsonType(current));
      return;
    }

    if (ancestors.has(current)) {
      truncated = true;
      return;
    }
    ancestors.add(current);

    if (Array.isArray(current)) {
      if (path) addField(path, "array");
      for (const child of current.slice(0, 10)) {
        visit(child, path ? `${path}[]` : "items[]", depth + 1);
      }
      if (current.length > 10) truncated = true;
      ancestors.delete(current);
      return;
    }

    if (Object.getPrototypeOf(current) !== Object.prototype) {
      truncated = true;
      ancestors.delete(current);
      return;
    }

    if (path) addField(path, "object");
    for (const [key, child] of Object.entries(current)) {
      if (!safeShapeKeyPattern.test(key) || isSensitiveKey(key)) {
        omittedSensitiveFieldCount += 1;
        continue;
      }
      const childPath = path ? `${path}.${key}` : key;
      const childType = jsonType(child);
      addField(childPath, childType);
      if (childType === "object" || childType === "array") {
        visit(child, childPath, depth + 1);
      }
    }
    ancestors.delete(current);
  };

  visit(value, "", 0);

  return safeResponseShapeSchema.parse({
    rootType: jsonType(value),
    fields,
    omittedSensitiveFieldCount,
    truncated,
  });
}
