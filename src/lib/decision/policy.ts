import {
  auditedPurchaseDecisionSchema,
  modelPurchaseProposalSchema,
  purchaseDecisionInputSchema,
  verifiedPurchaseDecisionSchema,
  type AuditedPurchaseDecision,
  type DecisionPolicyRule,
  type ModelPurchaseProposal,
  type PurchaseDecisionInput,
  type VerifiedPurchaseDecision,
} from "./contracts";
import { digestDecisionInput, digestDecisionOutput } from "./canonical";

export const DECISION_PROMPT_VERSION = "spendforge-purchase-decision-v1";
export const DECISION_CONFIDENCE_THRESHOLD_BPS = 8_500;

const injectionTextPattern =
  /(?:ignore\s+(?:all\s+)?(?:previous|prior|the\s+mission)|reveal\s+(?:all\s+)?environment\s+variables?|print\s+(?:the\s+)?system\s+prompt|(?:api|private)\s*key|bypass\s+(?:the\s+)?policy)/i;

const hardRejectRules = new Set<DecisionPolicyRule>([
  "RESOURCE_NOT_SELECTED",
  "RESOURCE_NOT_IN_CATALOG",
  "RESOURCE_SCHEMA_INVALID",
  "RESOURCE_INACTIVE",
  "RESOURCE_TYPE_DISALLOWED",
  "VENDOR_DISALLOWED",
  "RAIL_DISALLOWED",
  "PROVENANCE_TOO_LOW",
  "LICENSE_DISALLOWED",
  "DELIVERY_TYPE_UNSUPPORTED",
  "SELF_DEALING_RISK",
  "MCC_DISALLOWED",
  "PER_PURCHASE_CAP_EXCEEDED",
  "TOTAL_BUDGET_EXCEEDED",
  "MANDATE_EXPIRED",
  "DUPLICATE_ATTEMPT",
  "PROMPT_INJECTION_DETECTED",
  "CREDENTIAL_REQUEST_DETECTED",
  "UNTRUSTED_EXECUTABLE",
]);

const reviewRules = new Set<DecisionPolicyRule>([
  "MODEL_REQUESTED_REVIEW",
  "MCC_MISSING",
  "MODEL_MAXIMUM_BELOW_QUOTE",
  "PROVIDER_STATE_AMBIGUOUS",
  "PROVIDER_UNAVAILABLE",
  "AMBIGUOUS_PRIOR_ATTEMPT",
  "MISSING_EVIDENCE",
  "UNKNOWN_EVIDENCE_REFERENCE",
  "LOW_CONFIDENCE",
  "PROVIDER_CONFIGURATION_UNHEALTHY",
]);

const PROVENANCE_RANK = { SEEDED: 0, SIGNED: 1, VERIFIED: 2 } as const;

function pushUnique(
  rules: DecisionPolicyRule[],
  rule: DecisionPolicyRule,
): void {
  if (!rules.includes(rule)) rules.push(rule);
}

function verifyEvidence(
  input: PurchaseDecisionInput,
  proposal: ModelPurchaseProposal,
  rules: DecisionPolicyRule[],
  selectedEvidenceIds: readonly string[],
): void {
  const evidenceById = new Map(
    input.priorEvidence.map((item) => [item.evidenceId, item.state]),
  );

  for (const evidenceId of proposal.evidenceIds) {
    const state = evidenceById.get(evidenceId);
    if (!state) {
      pushUnique(rules, "UNKNOWN_EVIDENCE_REFERENCE");
    } else if (state !== "AVAILABLE") {
      pushUnique(rules, "MISSING_EVIDENCE");
    }
  }

  for (const evidenceId of input.mission.requiredEvidenceIds) {
    if (
      evidenceById.get(evidenceId) !== "AVAILABLE" ||
      !proposal.evidenceIds.includes(evidenceId)
    ) {
      pushUnique(rules, "MISSING_EVIDENCE");
    }
  }

  for (const evidenceId of selectedEvidenceIds) {
    if (
      evidenceById.get(evidenceId) !== "AVAILABLE" ||
      !proposal.evidenceIds.includes(evidenceId)
    ) {
      pushUnique(rules, "MISSING_EVIDENCE");
    }
  }
}

export function verifyPurchaseProposal(
  inputValue: PurchaseDecisionInput,
  proposalValue: ModelPurchaseProposal,
): VerifiedPurchaseDecision {
  const input = purchaseDecisionInputSchema.parse(inputValue);
  const proposal = modelPurchaseProposalSchema.parse(proposalValue);
  const rules: DecisionPolicyRule[] = [];

  if (proposal.action === "REJECT") pushUnique(rules, "MODEL_REJECTED");
  if (proposal.action === "NEEDS_REVIEW") {
    pushUnique(rules, "MODEL_REQUESTED_REVIEW");
  }

  const selected = proposal.selectedResourceId
    ? input.catalog.find(
        (resource) => resource.resourceId === proposal.selectedResourceId,
      )
    : undefined;

  if (proposal.action === "APPROVE" && !proposal.selectedResourceId) {
    pushUnique(rules, "RESOURCE_NOT_SELECTED");
  } else if (proposal.selectedResourceId && !selected) {
    pushUnique(rules, "RESOURCE_NOT_IN_CATALOG");
  }

  if (selected) {
    if (!selected.active) pushUnique(rules, "RESOURCE_INACTIVE");
    if (
      !input.mission.allowedResourceTypes.includes(selected.resourceType)
    ) {
      pushUnique(rules, "RESOURCE_TYPE_DISALLOWED");
    }
    if (!input.mission.allowedVendorIds.includes(selected.vendorId)) {
      pushUnique(rules, "VENDOR_DISALLOWED");
    }

    const mandate = input.mission;

    if (
      mandate.allowedPaymentRails &&
      !mandate.allowedPaymentRails.includes(selected.paymentRail)
    ) {
      pushUnique(rules, "RAIL_DISALLOWED");
    }
    if (
      mandate.minimumProvenance &&
      PROVENANCE_RANK[selected.provenance] <
        PROVENANCE_RANK[mandate.minimumProvenance]
    ) {
      pushUnique(rules, "PROVENANCE_TOO_LOW");
    }
    if (
      mandate.allowedLicenseUsages &&
      selected.licenseUsage &&
      !mandate.allowedLicenseUsages.includes(selected.licenseUsage)
    ) {
      pushUnique(rules, "LICENSE_DISALLOWED");
    }
    if (
      mandate.supportedDeliveryTypes &&
      selected.deliveryType &&
      !mandate.supportedDeliveryTypes.includes(selected.deliveryType)
    ) {
      pushUnique(rules, "DELIVERY_TYPE_UNSUPPORTED");
    }
    // Buying from yourself is denied unless the mandate names the resource as
    // a disclosed demo-supplier exception. "Demo mode" must never be a blanket
    // bypass, so the exception is per-resource and explicit.
    if (
      mandate.buyerWalletAddress &&
      selected.sellerWalletAddress &&
      mandate.buyerWalletAddress.toLowerCase() ===
        selected.sellerWalletAddress.toLowerCase() &&
      !(mandate.selfDealingExceptionResourceIds ?? []).includes(
        selected.resourceId,
      )
    ) {
      pushUnique(rules, "SELF_DEALING_RISK");
    }
    if (input.providerHealth?.[selected.paymentRail] === false) {
      pushUnique(rules, "PROVIDER_CONFIGURATION_UNHEALTHY");
    }

    // An MCC constraint is only enforced when the mandate configures one.
    if (
      selected.paymentRail === "RAIN_CARD" &&
      input.mission.allowedMerchantCategoryCodes.length > 0
    ) {
      if (!selected.merchantCategoryCode) {
        pushUnique(rules, "MCC_MISSING");
      } else if (
        !input.mission.allowedMerchantCategoryCodes.includes(
          selected.merchantCategoryCode,
        )
      ) {
        pushUnique(rules, "MCC_DISALLOWED");
      }
    }

    if (
      selected.quotedPriceCents > input.mission.perPurchaseCapCents
    ) {
      pushUnique(rules, "PER_PURCHASE_CAP_EXCEEDED");
    }
    if (selected.quotedPriceCents > input.mission.remainingBudgetCents) {
      pushUnique(rules, "TOTAL_BUDGET_EXCEEDED");
    }
    if (
      proposal.action === "APPROVE" &&
      proposal.maximumAuthorizedCents < selected.quotedPriceCents
    ) {
      pushUnique(rules, "MODEL_MAXIMUM_BELOW_QUOTE");
    }
    if (
      proposal.maximumAuthorizedCents > selected.quotedPriceCents ||
      proposal.maximumAuthorizedCents > input.mission.perPurchaseCapCents ||
      proposal.maximumAuthorizedCents > input.mission.remainingBudgetCents
    ) {
      pushUnique(rules, "MODEL_MAXIMUM_EXCEEDS_CAP");
    }

    if (selected.providerState === "AMBIGUOUS") {
      pushUnique(rules, "PROVIDER_STATE_AMBIGUOUS");
    } else if (selected.providerState === "UNAVAILABLE") {
      pushUnique(rules, "PROVIDER_UNAVAILABLE");
    }

    if (
      selected.attemptState === "IN_FLIGHT" ||
      selected.attemptState === "TERMINAL"
    ) {
      pushUnique(rules, "DUPLICATE_ATTEMPT");
    } else if (selected.attemptState === "AMBIGUOUS") {
      pushUnique(rules, "AMBIGUOUS_PRIOR_ATTEMPT");
    }

    if (
      selected.securitySignals.includes("PROMPT_INJECTION") ||
      injectionTextPattern.test(`${selected.title}\n${selected.description}`)
    ) {
      pushUnique(rules, "PROMPT_INJECTION_DETECTED");
    }
    if (selected.securitySignals.includes("CREDENTIAL_REQUEST")) {
      pushUnique(rules, "CREDENTIAL_REQUEST_DETECTED");
    }
    if (selected.securitySignals.includes("UNTRUSTED_EXECUTABLE")) {
      pushUnique(rules, "UNTRUSTED_EXECUTABLE");
    }
  }

  if (Date.parse(input.now) > Date.parse(input.mission.deadline)) {
    pushUnique(rules, "MANDATE_EXPIRED");
  }
  if (proposal.confidenceBps < DECISION_CONFIDENCE_THRESHOLD_BPS) {
    pushUnique(rules, "LOW_CONFIDENCE");
  }

  verifyEvidence(input, proposal, rules, selected?.evidenceIds ?? []);

  const hasHardReject = rules.some((rule) => hardRejectRules.has(rule));
  const needsReview = rules.some((rule) => reviewRules.has(rule));
  const finalAction = proposal.action === "REJECT" || hasHardReject
    ? "REJECT"
    : needsReview
      ? "NEEDS_REVIEW"
      : proposal.action;
  const eligibleForExecution = finalAction === "APPROVE" && Boolean(selected);
  const verifiedMaximumAuthorizedCents =
    eligibleForExecution && selected ? selected.quotedPriceCents : 0;
  const ruleCodes =
    rules.length === 0 ? (["POLICY_OK"] as const) : rules;

  return verifiedPurchaseDecisionSchema.parse({
    finalAction,
    selectedResourceId: selected?.resourceId ?? null,
    verifiedMaximumAuthorizedCents,
    eligibleForExecution,
    ruleCodes,
    modelActionOverridden:
      finalAction !== proposal.action ||
      verifiedMaximumAuthorizedCents !== proposal.maximumAuthorizedCents,
  });
}

export function createAuditedDecision(
  inputValue: PurchaseDecisionInput,
  proposalValue: ModelPurchaseProposal,
  metadata: {
    modelId: string;
    executionMode: "fixture" | "openai-live";
    evidenceMode: "fixture" | "openai-structured-output";
    providerResponseReference: string | null;
    startedAt: string;
    completedAt: string;
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    } | null;
  },
): AuditedPurchaseDecision {
  const input = purchaseDecisionInputSchema.parse(inputValue);
  const proposal = modelPurchaseProposalSchema.parse(proposalValue);
  const policyVerification = verifyPurchaseProposal(input, proposal);
  const truthState =
    metadata.executionMode === "fixture"
      ? "FIXTURE_PROPOSAL_VERIFIED"
      : policyVerification.finalAction === "APPROVE"
        ? "OPENAI_PROPOSAL_VERIFIED"
        : policyVerification.finalAction === "REJECT"
          ? "OPENAI_PROPOSAL_REJECTED_BY_POLICY"
          : "OPENAI_PROPOSAL_NEEDS_REVIEW";

  return auditedPurchaseDecisionSchema.parse({
    schemaVersion: 1,
    modelId: metadata.modelId,
    promptVersion: DECISION_PROMPT_VERSION,
    inputDigest: digestDecisionInput(input),
    outputDigest: digestDecisionOutput(proposal),
    startedAt: metadata.startedAt,
    completedAt: metadata.completedAt,
    executionMode: metadata.executionMode,
    evidenceMode: metadata.evidenceMode,
    providerResponseReference: metadata.providerResponseReference,
    usage: metadata.usage,
    proposal,
    policyVerification,
    truthState,
  });
}
