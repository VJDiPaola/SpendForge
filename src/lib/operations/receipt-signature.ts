import { createHmac, timingSafeEqual } from "node:crypto";

import { assertUiSafePayload } from "./redaction";
import { receiptSignatureSchema, type ReceiptSignature } from "./schemas";

/**
 * HMAC-SHA256 is a symmetric construction. This key is **not** a public key
 * and there is no private counterpart: anyone holding it can both verify and
 * produce a signature. It is published on purpose so that a reader who clones
 * the repository can run `npm run verify:receipt` against a receipt downloaded
 * from the running application and get a real pass or fail, rather than being
 * asked to take "auditable receipts" on trust.
 *
 * What a demo-key signature proves: the receipt bytes are exactly the bytes
 * SpendForge produced, and nothing was edited after the fact by someone who
 * did not bother to re-sign.
 *
 * What it does not prove: authorship. A published key cannot establish that,
 * and this module does not claim it does.
 *
 * A deployment that needs authorship sets RECEIPT_SIGNING_KEY to a secret key
 * held in the environment. Receipts then carry that key's id, verification
 * requires the same secret, and the demo key is not involved.
 */
export const DEMO_RECEIPT_SIGNING_KEY_ID = "spendforge-demo-v1";

/** Published, non-secret. See the note above before treating this as a secret. */
export const DEMO_RECEIPT_SIGNING_KEY =
  "c3BlbmRmb3JnZS1kZW1vLXJlY2VpcHQta2V5LXYxLW5vdC1hLXNlY3JldA==";

const SIGNATURE_DOMAIN = "spendforge-receipt-signature-v1";
const MAX_SALT = 64;

export type ReceiptSigningKey = {
  keyId: string;
  key: Buffer;
  published: boolean;
};

export function resolveReceiptSigningKey(
  source: Record<string, string | undefined> = process.env,
): ReceiptSigningKey {
  const configured = source.RECEIPT_SIGNING_KEY?.trim();
  if (configured) {
    const key = Buffer.from(configured, "base64");
    if (key.length < 32) {
      throw new Error(
        "RECEIPT_SIGNING_KEY must be at least 32 bytes of base64-encoded key material",
      );
    }
    return {
      keyId: source.RECEIPT_SIGNING_KEY_ID?.trim() || "deployment-v1",
      key,
      published: false,
    };
  }
  return {
    keyId: DEMO_RECEIPT_SIGNING_KEY_ID,
    key: Buffer.from(DEMO_RECEIPT_SIGNING_KEY, "base64"),
    published: true,
  };
}

/**
 * Deterministic JSON with recursively sorted object keys. Two structurally
 * identical receipts must serialize to identical bytes regardless of the order
 * their fields were assigned, or a signature would depend on construction
 * order rather than content.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
    .join(",")}}`;
}

/**
 * The signed message covers every receipt field except the signature itself.
 *
 * This is deliberately schema-agnostic. The application serves more than one
 * receipt shape — the journal-backed audit receipt and the Atlas decision
 * receipt have different schemas — and a reader should not have to work out
 * why some receipts carry a signature and others do not.
 */
export function canonicalReceiptPayload(receipt: object): string {
  const unsigned = Object.fromEntries(
    Object.entries(receipt).filter(([key]) => key !== "signature"),
  );
  return canonicalize(unsigned);
}

function computeSignature(
  payload: string,
  salt: number,
  key: Buffer,
): string {
  return `hmac-sha256:${createHmac("sha256", key)
    .update(`${SIGNATURE_DOMAIN}${salt}${payload}`, "utf8")
    .digest("hex")}`;
}

export function signAuditReceipt<T extends object>(
  receipt: T,
  signingKey: ReceiptSigningKey = resolveReceiptSigningKey(),
): T & { signature: ReceiptSignature } {
  const payload = canonicalReceiptPayload(receipt);

  // A hexadecimal digest can contain a Luhn-valid 13-19 digit run and trip the
  // defense-in-depth PAN scanner, the same hazard journalHash works around.
  // The salt is part of the signed message and is published in the envelope,
  // so verification stays exact.
  for (let salt = 0; salt < MAX_SALT; salt += 1) {
    const value = computeSignature(payload, salt, signingKey.key);
    const signature: ReceiptSignature = {
      algorithm: "HMAC-SHA256",
      keyId: signingKey.keyId,
      salt,
      value,
    };
    try {
      assertUiSafePayload(signature, "signature");
    } catch {
      continue;
    }
    return { ...receipt, signature };
  }
  throw new Error("Unable to derive a scanner-safe receipt signature");
}

export type ReceiptVerification =
  | { valid: true; keyId: string; usedPublishedDemoKey: boolean }
  | { valid: false; reason: string };

export function verifyAuditReceipt(
  receiptValue: unknown,
  signingKey: ReceiptSigningKey = resolveReceiptSigningKey(),
): ReceiptVerification {
  if (
    typeof receiptValue !== "object" ||
    receiptValue === null ||
    Array.isArray(receiptValue)
  ) {
    return { valid: false, reason: "Receipt is not a JSON object" };
  }
  const receipt = receiptValue as Record<string, unknown>;
  if (receipt.signature === undefined) {
    return { valid: false, reason: "Receipt carries no signature" };
  }
  const parsedSignature = receiptSignatureSchema.safeParse(receipt.signature);
  if (!parsedSignature.success) {
    return { valid: false, reason: "Signature envelope is malformed" };
  }
  const signature = parsedSignature.data;
  if (signature.keyId !== signingKey.keyId) {
    return {
      valid: false,
      reason: `Receipt is signed with key "${signature.keyId}" but verification used "${signingKey.keyId}"`,
    };
  }

  const expected = computeSignature(
    canonicalReceiptPayload(receipt),
    signature.salt,
    signingKey.key,
  );
  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(signature.value, "utf8");
  if (
    expectedBytes.length !== actualBytes.length ||
    !timingSafeEqual(expectedBytes, actualBytes)
  ) {
    return {
      valid: false,
      reason: "Signature does not match the receipt contents",
    };
  }

  return {
    valid: true,
    keyId: signature.keyId,
    usedPublishedDemoKey: signingKey.published,
  };
}
