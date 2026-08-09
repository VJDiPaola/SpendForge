import { createHash } from "node:crypto";

import { z } from "zod";

export const pulseResourceManifestSchema = z
  .object({
    id: z.literal("pulse-component-v1"),
    manifestVersion: z.literal(1),
    supplierMode: z.literal("synthetic-programmatic-merchant"),
    resourceType: z.literal("api-delivered-ui-capability-manifest"),
    delivery: z.literal("machine-readable-json"),
    license: z.literal("hackathon-demo-testnet-only"),
    capabilities: z.tuple([
      z.literal("mission-evidence-card"),
      z.literal("policy-status-module"),
      z.literal("audit-receipt-link"),
    ]),
  })
  .strict();

export const PULSE_RESOURCE_MANIFEST = pulseResourceManifestSchema.parse({
  id: "pulse-component-v1",
  manifestVersion: 1,
  supplierMode: "synthetic-programmatic-merchant",
  resourceType: "api-delivered-ui-capability-manifest",
  delivery: "machine-readable-json",
  license: "hackathon-demo-testnet-only",
  capabilities: [
    "mission-evidence-card",
    "policy-status-module",
    "audit-receipt-link",
  ],
});

export const PULSE_RESOURCE_CONTENT_HASH = `sha256:${createHash("sha256")
  .update(JSON.stringify(PULSE_RESOURCE_MANIFEST))
  .digest("hex")}` as const;
