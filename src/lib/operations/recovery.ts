import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { z } from "zod";

import {
  encryptedRecoveryReferenceSchema,
  fingerprintSchema,
  recoveryReferenceKindSchema,
  type EncryptedRecoveryReference,
  type RecoveryReferenceKind,
} from "./schemas";

const recoveryKeySchema = z.string().trim().min(1).transform((encoded, context) => {
  let key: Buffer;
  try {
    key = Buffer.from(encoded, "base64");
  } catch {
    context.addIssue({ code: "custom", message: "Recovery key is invalid" });
    return z.NEVER;
  }
  if (key.length !== 32) {
    context.addIssue({ code: "custom", message: "Recovery key must be 32 bytes" });
    return z.NEVER;
  }
  return key;
});

function associatedData(
  kind: RecoveryReferenceKind,
  contextFingerprint: string,
): Buffer {
  return Buffer.from(
    `spendforge-recovery-v1\u001f${kind}\u001f${contextFingerprint}`,
    "utf8",
  );
}

function keyFingerprint(key: Buffer): string {
  return `sha256:${createHash("sha256")
    .update(key)
    .digest("hex")
    .slice(0, 16)}`;
}

export function encryptRecoveryReference(input: {
  kind: RecoveryReferenceKind;
  rawReference: string;
  contextFingerprint: string;
  encodedKey: string;
}): EncryptedRecoveryReference {
  const kind = recoveryReferenceKindSchema.parse(input.kind);
  const contextFingerprint = fingerprintSchema.parse(
    input.contextFingerprint,
  );
  const rawReference = z.string().min(1).max(512).parse(input.rawReference);
  const key = recoveryKeySchema.parse(input.encodedKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(associatedData(kind, contextFingerprint));
  const ciphertext = Buffer.concat([
    cipher.update(rawReference, "utf8"),
    cipher.final(),
  ]);

  return encryptedRecoveryReferenceSchema.parse({
    version: 1,
    algorithm: "A256GCM",
    kind,
    keyFingerprint: keyFingerprint(key),
    contextFingerprint,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authenticationTag: cipher.getAuthTag().toString("base64url"),
  });
}

export function decryptRecoveryReference(input: {
  envelope: EncryptedRecoveryReference;
  expectedKind: RecoveryReferenceKind;
  expectedContextFingerprint: string;
  encodedKey: string;
}): string {
  const envelope = encryptedRecoveryReferenceSchema.parse(input.envelope);
  const expectedKind = recoveryReferenceKindSchema.parse(input.expectedKind);
  const expectedContextFingerprint = fingerprintSchema.parse(
    input.expectedContextFingerprint,
  );
  const key = recoveryKeySchema.parse(input.encodedKey);
  if (
    envelope.kind !== expectedKind ||
    envelope.contextFingerprint !== expectedContextFingerprint ||
    envelope.keyFingerprint !== keyFingerprint(key)
  ) {
    throw new Error("RECOVERY_REFERENCE_UNAVAILABLE");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(envelope.iv, "base64url"),
    );
    decipher.setAAD(associatedData(expectedKind, expectedContextFingerprint));
    decipher.setAuthTag(
      Buffer.from(envelope.authenticationTag, "base64url"),
    );
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("RECOVERY_REFERENCE_UNAVAILABLE");
  }
}
