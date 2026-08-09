import { createHash } from "node:crypto";

import { z } from "zod";

import {
  fingerprintSchema,
  mutationOperationKindSchema,
  operationProviderSchema,
  type Fingerprint,
} from "./schemas";

const logicalReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, "Logical references contain unsafe characters");

export const idempotencyLogicalKeySchema = z
  .object({
    missionRef: logicalReferenceSchema,
    runRef: logicalReferenceSchema,
    offerRef: logicalReferenceSchema,
    provider: operationProviderSchema,
    operation: mutationOperationKindSchema,
    generation: z.number().int().positive().max(1_000_000),
  })
  .strict();
export type IdempotencyLogicalKey = z.infer<
  typeof idempotencyLogicalKeySchema
>;

function sha256(value: string): Fingerprint {
  return fingerprintSchema.parse(
    `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`,
  );
}

/** A deterministic evidence fingerprint, never the provider idempotency key. */
export function deriveIdempotencyFingerprint(
  logical: IdempotencyLogicalKey,
): Fingerprint {
  const parsed = idempotencyLogicalKeySchema.parse(logical);
  return sha256(
    [
      "spendforge-operation-v1",
      parsed.missionRef,
      parsed.runRef,
      parsed.offerRef,
      parsed.provider,
      parsed.operation,
      String(parsed.generation),
    ].join("\u001f"),
  );
}

export function deriveEvidenceFingerprint(value: string): Fingerprint {
  return sha256(value);
}
