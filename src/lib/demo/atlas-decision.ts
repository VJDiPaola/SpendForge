import { z } from "zod";

import {
  auditedPurchaseDecisionSchema,
  DeterministicFixtureDecisionModel,
  purchaseDecisionInputSchema,
  type AuditedPurchaseDecision,
  type PurchaseDecisionInput,
} from "@/lib/decision";
import { assertUiSafePayload } from "@/lib/operations/redaction";
import type { MissionRun } from "@/lib/domain";

import {
  ATLAS_FIXTURE_NOW,
  ATLAS_MANDATE,
  ATLAS_MISSION,
  ATLAS_OFFERS,
} from "./atlas-fixture";

export const ATLAS_AGENT_DECISION_RECEIPT_ID =
  "audit_atlas_agent_decision_fixture_v1";

const atlasDecisionReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    receiptId: z.literal(ATLAS_AGENT_DECISION_RECEIPT_ID),
    generatedAt: z.string().datetime({ offset: true }),
    truthBoundary: z.literal("fixture-only"),
    synthetic: z.literal(true),
    disclosureCode: z.literal("FIXTURE_DECISION_NO_OPENAI_API_CALL"),
    chainOfThoughtStored: z.literal(false),
    decision: auditedPurchaseDecisionSchema,
  })
  .strict();

export type AtlasDecisionReceipt = z.infer<
  typeof atlasDecisionReceiptSchema
>;

export type AtlasFixtureRunEnvelope = {
  run: MissionRun;
  agentDecision: AuditedPurchaseDecision;
  truthBoundary: "fixture-only";
};

function priceInConservativeCents(amount: string, decimals: number): number {
  const atomic = Number(amount);
  if (!Number.isSafeInteger(atomic) || atomic < 0) {
    throw new Error("Atlas decision price is not a safe integer");
  }
  if (decimals === 2) return atomic;
  if (decimals < 2) return atomic * 10 ** (2 - decimals);
  return Math.ceil(atomic / 10 ** (decimals - 2));
}

function evidenceIdsForOffer(offerId: string): string[] {
  return [`catalog:${offerId}`, `quote:${offerId}`];
}

export function buildAtlasPurchaseDecisionInput(): PurchaseDecisionInput {
  const orderedOffers = [...ATLAS_OFFERS].sort((left, right) => {
    if (left.id === "offer_northstar_background_v1") return -1;
    if (right.id === "offer_northstar_background_v1") return 1;
    return left.id.localeCompare(right.id);
  });
  const catalog = orderedOffers.map((offer) => ({
    resourceId: offer.id,
    title: offer.title,
    description: offer.description,
    vendorId: offer.seller.id,
    merchantCategoryCode: offer.rail === "rain_card" ? "5734" : null,
    resourceType: offer.type,
    paymentRail:
      offer.rail === "rain_card"
        ? ("RAIN_CARD" as const)
        : offer.rail === "monad_x402"
          ? ("MONAD_X402" as const)
          : ("FREE" as const),
    quotedPriceCents: priceInConservativeCents(
      offer.price.amount,
      offer.price.decimals,
    ),
    active: offer.active,
    provenance:
      offer.provenance === "verified"
        ? ("VERIFIED" as const)
        : offer.provenance === "signed"
          ? ("SIGNED" as const)
          : ("SEEDED" as const),
    evidenceIds: evidenceIdsForOffer(offer.id),
    securitySignals: offer.securitySignals.map((signal) =>
      signal === "prompt_injection"
        ? ("PROMPT_INJECTION" as const)
        : signal === "credential_request"
          ? ("CREDENTIAL_REQUEST" as const)
          : ("UNTRUSTED_EXECUTABLE" as const),
    ),
    providerState: "READY" as const,
    attemptState: "NONE" as const,
  }));
  const priorEvidence = [
    {
      evidenceId: "mandate:atlas:v1",
      state: "AVAILABLE" as const,
      summary: "Versioned Atlas mandate loaded from the deterministic fixture.",
    },
    {
      evidenceId: "catalog:atlas:v1",
      state: "AVAILABLE" as const,
      summary: "Fixed synthetic catalog validated before model evaluation.",
    },
    ...catalog.flatMap((resource) =>
      resource.evidenceIds.map((evidenceId) => ({
        evidenceId,
        state: "AVAILABLE" as const,
        summary: "Synthetic catalog or quote evidence for the bounded fixture.",
      })),
    ),
  ];

  return purchaseDecisionInputSchema.parse({
    mission: {
      id: ATLAS_MISSION.id,
      objective: ATLAS_MISSION.objective,
      totalBudgetCents: 25,
      perPurchaseCapCents: 15,
      remainingBudgetCents: 25,
      allowedResourceTypes: ATLAS_MANDATE.allowedResourceTypes,
      allowedVendorIds: ATLAS_MANDATE.allowedSellerIds,
      allowedMerchantCategoryCodes: ["5734"],
      requiredEvidenceIds: ["mandate:atlas:v1", "catalog:atlas:v1"],
      deadline: ATLAS_MANDATE.deadline,
    },
    catalog,
    priorEvidence,
    now: ATLAS_FIXTURE_NOW,
  });
}

export async function buildAtlasFixtureDecisionAudit(): Promise<AuditedPurchaseDecision> {
  return new DeterministicFixtureDecisionModel().decide(
    buildAtlasPurchaseDecisionInput(),
  );
}

export async function buildAtlasDecisionReceipt(): Promise<AtlasDecisionReceipt> {
  const receipt = atlasDecisionReceiptSchema.parse({
    schemaVersion: 1,
    receiptId: ATLAS_AGENT_DECISION_RECEIPT_ID,
    generatedAt: ATLAS_FIXTURE_NOW,
    truthBoundary: "fixture-only",
    synthetic: true,
    disclosureCode: "FIXTURE_DECISION_NO_OPENAI_API_CALL",
    chainOfThoughtStored: false,
    decision: await buildAtlasFixtureDecisionAudit(),
  });
  assertUiSafePayload(receipt, "atlasDecisionReceipt");
  return receipt;
}

export { atlasDecisionReceiptSchema };
