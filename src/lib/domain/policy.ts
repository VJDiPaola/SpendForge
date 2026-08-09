// This module used to be a second policy engine. It is now an adapter.
//
// There is exactly one place in SpendForge where a purchase rule is decided:
// `verifyPurchaseProposal` in `src/lib/decision/policy.ts`. The guided mission
// and the live Rain path both run through it. What lives here is the
// translation between the mission-facing domain vocabulary (offers, mandates,
// rails, normalized demo budget amounts) and the decision engine's contract,
// plus the demo's own accounting of committed spend.
//
// Adding a rule here is a mistake. Add it to the decision engine and map its
// code below, so the demo a reviewer clicks and the path that moves money
// cannot drift apart.
import {
  addBudgetAmounts,
  normalizeForDemoBudget,
} from "./money";
import {
  verifyPurchaseProposal,
  type DecisionPolicyRule,
  type ModelPurchaseProposal,
  type PurchaseDecisionInput,
} from "@/lib/decision";
import type {
  DemoParityQuote,
  HexAddress,
  ISODateTime,
  LicenseUsage,
  Mandate,
  NormalizedBudgetAmount,
  PaymentRail,
  PolicyResult,
  PolicyRuleCode,
  Provenance,
  PurchaseAction,
  PurchaseDecision,
  ResourceOffer,
} from "./types";

export type PolicyContext = {
  now: ISODateTime;
  committedSpend: NormalizedBudgetAmount;
  parityQuote: DemoParityQuote;
  buyerWalletAddress?: HexAddress;
  providerHealth: Record<PaymentRail, boolean>;
  terminalIdempotencyKeys: ReadonlySet<string>;
  idempotencyKey: string;
};

const BLOCKING_CODES = new Set<PolicyRuleCode>([
  "OFFER_SCHEMA_INVALID",
  "OFFER_INACTIVE",
  "RAIL_NOT_ALLOWED",
  "RESOURCE_TYPE_NOT_ALLOWED",
  "PER_PURCHASE_CAP_EXCEEDED",
  "TOTAL_BUDGET_EXCEEDED",
  "MANDATE_EXPIRED",
  "PROVENANCE_TOO_LOW",
  "LICENSE_NOT_ALLOWED",
  "DELIVERY_TYPE_UNSUPPORTED",
  "DUPLICATE_TERMINAL_ATTEMPT",
  "PROMPT_INJECTION_DETECTED",
  "CREDENTIAL_REQUEST_DETECTED",
  "UNTRUSTED_EXECUTABLE",
]);

export const POLICY_RULE_LABELS: Record<PolicyRuleCode, string> = {
  POLICY_OK: "All deterministic mandate checks passed",
  OFFER_SCHEMA_INVALID: "Offer schema is invalid",
  OFFER_INACTIVE: "Offer is not active",
  RAIL_NOT_ALLOWED: "Payment rail is outside the mandate",
  RESOURCE_TYPE_NOT_ALLOWED: "Resource type is outside the mandate",
  SELLER_NOT_ALLOWED: "Seller is not allowed by the mandate",
  PER_PURCHASE_CAP_EXCEEDED: "Offer exceeds the per-purchase cap",
  TOTAL_BUDGET_EXCEEDED: "Offer would exceed the total mission budget",
  MANDATE_EXPIRED: "Mission mandate has expired",
  PROVENANCE_TOO_LOW: "Resource provenance is below the mandate minimum",
  LICENSE_NOT_ALLOWED: "Resource license is not allowed",
  DELIVERY_TYPE_UNSUPPORTED: "Delivery type is not supported in P0",
  SELF_DEALING_RISK: "Buyer and seller wallet addresses match",
  LOW_CONFIDENCE: "Decision confidence is below 85 percent",
  PROVIDER_CONFIGURATION_UNHEALTHY: "Required provider configuration is unavailable",
  DUPLICATE_TERMINAL_ATTEMPT: "This idempotency key already has a terminal attempt",
  PROMPT_INJECTION_DETECTED: "Untrusted resource metadata contains prompt injection",
  CREDENTIAL_REQUEST_DETECTED: "Resource metadata requests a server credential",
  UNTRUSTED_EXECUTABLE: "Resource would require untrusted code execution",
};

/**
 * Decision-engine rule codes translated into the mission vocabulary. Codes
 * absent from this map describe conditions the guided mission cannot express
 * (model-authored proposal defects, evidence references, merchant category
 * codes) and are dropped rather than renamed into something they are not.
 */
const RULE_CODE_TRANSLATION: Partial<
  Record<DecisionPolicyRule, PolicyRuleCode>
> = {
  POLICY_OK: "POLICY_OK",
  RESOURCE_SCHEMA_INVALID: "OFFER_SCHEMA_INVALID",
  RESOURCE_INACTIVE: "OFFER_INACTIVE",
  RESOURCE_TYPE_DISALLOWED: "RESOURCE_TYPE_NOT_ALLOWED",
  VENDOR_DISALLOWED: "SELLER_NOT_ALLOWED",
  RAIL_DISALLOWED: "RAIL_NOT_ALLOWED",
  PER_PURCHASE_CAP_EXCEEDED: "PER_PURCHASE_CAP_EXCEEDED",
  TOTAL_BUDGET_EXCEEDED: "TOTAL_BUDGET_EXCEEDED",
  MANDATE_EXPIRED: "MANDATE_EXPIRED",
  PROVENANCE_TOO_LOW: "PROVENANCE_TOO_LOW",
  LICENSE_DISALLOWED: "LICENSE_NOT_ALLOWED",
  DELIVERY_TYPE_UNSUPPORTED: "DELIVERY_TYPE_UNSUPPORTED",
  SELF_DEALING_RISK: "SELF_DEALING_RISK",
  LOW_CONFIDENCE: "LOW_CONFIDENCE",
  PROVIDER_CONFIGURATION_UNHEALTHY: "PROVIDER_CONFIGURATION_UNHEALTHY",
  DUPLICATE_ATTEMPT: "DUPLICATE_TERMINAL_ATTEMPT",
  PROMPT_INJECTION_DETECTED: "PROMPT_INJECTION_DETECTED",
  CREDENTIAL_REQUEST_DETECTED: "CREDENTIAL_REQUEST_DETECTED",
  UNTRUSTED_EXECUTABLE: "UNTRUSTED_EXECUTABLE",
};

const RAIL_TRANSLATION: Record<
  PaymentRail,
  PurchaseDecisionInput["catalog"][number]["paymentRail"]
> = {
  free: "FREE",
  rain_card: "RAIN_CARD",
  monad_x402: "MONAD_X402",
};

const PROVENANCE_TRANSLATION: Record<
  Provenance,
  PurchaseDecisionInput["catalog"][number]["provenance"]
> = {
  seeded: "SEEDED",
  signed: "SIGNED",
  verified: "VERIFIED",
};

const LICENSE_TRANSLATION: Record<
  LicenseUsage,
  NonNullable<PurchaseDecisionInput["catalog"][number]["licenseUsage"]>
> = {
  "demo-only": "DEMO_ONLY",
  permissive: "PERMISSIVE",
  commercial: "COMMERCIAL",
};

const DELIVERY_TRANSLATION: Record<
  ResourceOffer["deliveryType"],
  NonNullable<PurchaseDecisionInput["catalog"][number]["deliveryType"]>
> = {
  manifest: "MANIFEST",
  asset: "ASSET",
  json: "JSON",
  compute_job: "COMPUTE_JOB",
};

const SECURITY_SIGNAL_TRANSLATION: Record<
  ResourceOffer["securitySignals"][number],
  PurchaseDecisionInput["catalog"][number]["securitySignals"][number]
> = {
  prompt_injection: "PROMPT_INJECTION",
  credential_request: "CREDENTIAL_REQUEST",
  untrusted_executable: "UNTRUSTED_EXECUTABLE",
};

const SHAPE_VALIDATION_QUOTE: DemoParityQuote = {
  id: "shape-validation",
  baseAsset: "USDC",
  baseAtomicAmount: "1000000",
  baseDecimals: 6,
  quoteAsset: "USD",
  quoteAtomicAmount: "100",
  quoteDecimals: 2,
  accountingDecimals: 6,
  asOf: "2026-01-01T00:00:00.000Z",
  mode: "fixture-assumption",
  disclosure: "Internal shape validation quote.",
};

function hasValidIsoDateTime(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function offerShapeIsValid(offer: ResourceOffer): boolean {
  try {
    // Shape validation only needs a self-consistent quote for the offer asset.
    normalizeForDemoBudget(offer.price, SHAPE_VALIDATION_QUOTE);
  } catch {
    return false;
  }

  return (
    offer.id.length > 0 &&
    Number.isSafeInteger(offer.version) &&
    offer.version > 0 &&
    offer.seller.id.length > 0 &&
    offer.title.length > 0 &&
    offer.license.label.length > 0 &&
    Array.isArray(offer.securitySignals)
  );
}

function sellerIsAllowed(offer: ResourceOffer, mandate: Mandate): boolean {
  if (mandate.allowedSellerIds.includes(offer.seller.id)) return true;

  return (
    mandate.demoSupplierMode.enabled && offer.seller.disclosedDemoSupplier
  );
}

function hasSelfDealingException(
  offer: ResourceOffer,
  mandate: Mandate,
): boolean {
  return (
    mandate.demoSupplierMode.enabled &&
    offer.seller.disclosedDemoSupplier &&
    mandate.demoSupplierMode.selfDealingExceptionOfferIds.includes(offer.id)
  );
}

export function createLogicalIdempotencyKey(input: {
  missionId: string;
  runId: string;
  offerId: string;
  rail: PaymentRail;
  mandateVersion: number;
  attemptGeneration: number;
}): string {
  if (
    !Number.isSafeInteger(input.mandateVersion) ||
    input.mandateVersion < 1 ||
    !Number.isSafeInteger(input.attemptGeneration) ||
    input.attemptGeneration < 0
  ) {
    throw new Error("Idempotency versions must be non-negative safe integers");
  }

  return [
    input.missionId,
    input.runId,
    input.offerId,
    input.rail,
    `m${input.mandateVersion}`,
    `a${input.attemptGeneration}`,
  ]
    .map((part) => encodeURIComponent(part))
    .join(":");
}

function blockedResult(
  code: PolicyRuleCode,
  mandate: Mandate,
  context: PolicyContext,
): PolicyResult {
  return {
    eligible: false,
    disposition: "blocked",
    ruleCodes: [code],
    committedSpendBefore: context.committedSpend,
    mandateVersion: mandate.version,
    evaluatedAt: context.now,
  };
}

/**
 * Normalized demo amounts are integer strings in the accounting unit
 * (six decimals of DEMO_USD). The decision engine compares integer minor
 * units, so the same integers can be handed straight across as long as every
 * amount in one evaluation shares a unit — which they do here, because they
 * all come from `normalizeForDemoBudget` against the same parity quote.
 */
function minorUnits(amount: NormalizedBudgetAmount): number {
  const value = Number(amount.amount);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Normalized amount is not a safe integer: ${amount.amount}`);
  }
  return value;
}

export function evaluatePurchasePolicy(input: {
  offer: ResourceOffer;
  mandate: Mandate;
  decision: PurchaseDecision;
  context: PolicyContext;
}): PolicyResult {
  const { offer, mandate, decision, context } = input;

  if (!offerShapeIsValid(offer)) {
    return blockedResult("OFFER_SCHEMA_INVALID", mandate, context);
  }

  const normalizedPrice = normalizeForDemoBudget(offer.price, context.parityQuote);
  const normalizedCap = normalizeForDemoBudget(
    mandate.perPurchaseCap,
    context.parityQuote,
  );
  const normalizedBudget = normalizeForDemoBudget(
    mandate.totalBudget,
    context.parityQuote,
  );
  const projectedSpend = addBudgetAmounts(context.committedSpend, normalizedPrice);

  const totalBudgetCents = minorUnits(normalizedBudget);
  const committedCents = minorUnits(context.committedSpend);
  const remainingBudgetCents = Math.max(0, totalBudgetCents - committedCents);
  // The engine caps `perPurchaseCap` at the total budget; a demo mandate that
  // sets a looser cap is clamped rather than rejected as malformed.
  const perPurchaseCapCents = Math.min(minorUnits(normalizedCap), totalBudgetCents);

  // A malformed timestamp is treated as an expired mandate, exactly as before.
  // The engine's contract requires parseable timestamps, so the check happens
  // here and a self-consistent pair is passed through.
  const timestampsValid =
    hasValidIsoDateTime(context.now) && hasValidIsoDateTime(mandate.deadline);
  const now = timestampsValid ? context.now : SHAPE_VALIDATION_QUOTE.asOf;
  const deadline = timestampsValid ? mandate.deadline : SHAPE_VALIDATION_QUOTE.asOf;

  const decisionInput: PurchaseDecisionInput = {
    mission: {
      id: mandate.id,
      objective: `Guided mission mandate ${mandate.id}`,
      totalBudgetCents,
      perPurchaseCapCents,
      remainingBudgetCents,
      allowedResourceTypes: mandate.allowedResourceTypes,
      // Demo-supplier disclosure is resolved here, in the domain, because it
      // depends on seller identity the engine does not model.
      allowedVendorIds: sellerIsAllowed(offer, mandate)
        ? [offer.seller.id]
        : mandate.allowedSellerIds,
      allowedMerchantCategoryCodes: [],
      requiredEvidenceIds: [],
      deadline,
      allowedPaymentRails: mandate.allowedRails.map((rail) => RAIL_TRANSLATION[rail]),
      minimumProvenance: PROVENANCE_TRANSLATION[mandate.minimumProvenance],
      allowedLicenseUsages: mandate.allowedLicenseUsages.map(
        (usage) => LICENSE_TRANSLATION[usage],
      ),
      supportedDeliveryTypes: mandate.supportedDeliveryTypes.map(
        (type) => DELIVERY_TRANSLATION[type],
      ),
      ...(context.buyerWalletAddress
        ? { buyerWalletAddress: context.buyerWalletAddress }
        : {}),
      ...(hasSelfDealingException(offer, mandate)
        ? { selfDealingExceptionResourceIds: [offer.id] }
        : {}),
    },
    catalog: [
      {
        resourceId: offer.id,
        title: offer.title,
        description: offer.description,
        vendorId: offer.seller.id,
        merchantCategoryCode: null,
        resourceType: offer.type,
        paymentRail: RAIL_TRANSLATION[offer.rail],
        quotedPriceCents: minorUnits(normalizedPrice),
        active: offer.active,
        provenance: PROVENANCE_TRANSLATION[offer.provenance],
        licenseUsage: LICENSE_TRANSLATION[offer.license.usage],
        deliveryType: DELIVERY_TRANSLATION[offer.deliveryType],
        ...(offer.seller.walletAddress
          ? { sellerWalletAddress: offer.seller.walletAddress }
          : {}),
        evidenceIds: [],
        securitySignals: offer.securitySignals.map(
          (signal) => SECURITY_SIGNAL_TRANSLATION[signal],
        ),
        providerState: "READY",
        attemptState: context.terminalIdempotencyKeys.has(context.idempotencyKey)
          ? "TERMINAL"
          : "NONE",
      },
    ],
    priorEvidence: [],
    now,
    providerHealth: {
      FREE: context.providerHealth.free,
      RAIN_CARD: context.providerHealth.rain_card,
      MONAD_X402: context.providerHealth.monad_x402,
    },
  };

  // The mission's own action is applied later by `resolveFinalAction`. What is
  // verified here is the offer against the mandate, so the proposal handed to
  // the engine is a neutral "buy this at the quoted price" at the decision's
  // stated confidence.
  const proposal: ModelPurchaseProposal = {
    action: "APPROVE",
    selectedResourceId: offer.id,
    maximumAuthorizedCents: minorUnits(normalizedPrice),
    rationale: decision.summary.whyAction,
    evidenceIds: [],
    policyRisks: ["NONE"],
    confidenceBps: decision.confidenceBps,
  };

  const verified = verifyPurchaseProposal(decisionInput, proposal);

  const ruleCodes: PolicyRuleCode[] = [];
  for (const rule of verified.ruleCodes) {
    const translated = RULE_CODE_TRANSLATION[rule];
    if (translated && translated !== "POLICY_OK" && !ruleCodes.includes(translated)) {
      ruleCodes.push(translated);
    }
  }
  if (!timestampsValid && !ruleCodes.includes("MANDATE_EXPIRED")) {
    ruleCodes.push("MANDATE_EXPIRED");
  }

  const hasBlockingRule = ruleCodes.some((code) => BLOCKING_CODES.has(code));
  const disposition = hasBlockingRule
    ? "blocked"
    : ruleCodes.length > 0
      ? "escalate"
      : "allowed";

  return {
    eligible: disposition === "allowed",
    disposition,
    ruleCodes: ruleCodes.length > 0 ? ruleCodes : ["POLICY_OK"],
    committedSpendBefore: context.committedSpend,
    ...(disposition === "allowed" ? { committedSpendAfter: projectedSpend } : {}),
    mandateVersion: mandate.version,
    evaluatedAt: context.now,
  };
}

export function resolveFinalAction(
  decision: PurchaseDecision,
  policy: PolicyResult,
): PurchaseAction {
  if (policy.disposition === "blocked") return "block";
  if (policy.disposition === "escalate") return "escalate";
  return decision.action;
}
