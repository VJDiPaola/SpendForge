import {
  addBudgetAmounts,
  compareBudgetAmounts,
  normalizeForDemoBudget,
} from "./money";
import type {
  DemoParityQuote,
  HexAddress,
  ISODateTime,
  Mandate,
  NormalizedBudgetAmount,
  PaymentRail,
  PolicyResult,
  PolicyRuleCode,
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

const PROVENANCE_RANK = {
  seeded: 0,
  signed: 1,
  verified: 2,
} as const;

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

function hasValidIsoDateTime(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function offerShapeIsValid(offer: ResourceOffer): boolean {
  try {
    normalizeForDemoBudget(
      offer.price,
      // Shape validation only needs a self-consistent quote for the offer asset.
      {
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
      },
    );
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

function walletsMatch(
  buyerAddress: HexAddress | undefined,
  sellerAddress: HexAddress | undefined,
): boolean {
  return Boolean(
    buyerAddress &&
      sellerAddress &&
      buyerAddress.toLowerCase() === sellerAddress.toLowerCase(),
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

export function evaluatePurchasePolicy(input: {
  offer: ResourceOffer;
  mandate: Mandate;
  decision: PurchaseDecision;
  context: PolicyContext;
}): PolicyResult {
  const { offer, mandate, decision, context } = input;
  const ruleCodes: PolicyRuleCode[] = [];

  if (!offerShapeIsValid(offer)) {
    return {
      eligible: false,
      disposition: "blocked",
      ruleCodes: ["OFFER_SCHEMA_INVALID"],
      committedSpendBefore: context.committedSpend,
      mandateVersion: mandate.version,
      evaluatedAt: context.now,
    };
  }

  if (!offer.active) ruleCodes.push("OFFER_INACTIVE");
  if (!mandate.allowedRails.includes(offer.rail)) {
    ruleCodes.push("RAIL_NOT_ALLOWED");
  }
  if (!mandate.allowedResourceTypes.includes(offer.type)) {
    ruleCodes.push("RESOURCE_TYPE_NOT_ALLOWED");
  }
  if (!sellerIsAllowed(offer, mandate)) {
    ruleCodes.push("SELLER_NOT_ALLOWED");
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
  const projectedSpend = addBudgetAmounts(
    context.committedSpend,
    normalizedPrice,
  );

  if (compareBudgetAmounts(normalizedPrice, normalizedCap) > 0) {
    ruleCodes.push("PER_PURCHASE_CAP_EXCEEDED");
  }
  if (compareBudgetAmounts(projectedSpend, normalizedBudget) > 0) {
    ruleCodes.push("TOTAL_BUDGET_EXCEEDED");
  }
  if (
    !hasValidIsoDateTime(context.now) ||
    !hasValidIsoDateTime(mandate.deadline) ||
    Date.parse(context.now) > Date.parse(mandate.deadline)
  ) {
    ruleCodes.push("MANDATE_EXPIRED");
  }
  if (
    PROVENANCE_RANK[offer.provenance] <
    PROVENANCE_RANK[mandate.minimumProvenance]
  ) {
    ruleCodes.push("PROVENANCE_TOO_LOW");
  }
  if (!mandate.allowedLicenseUsages.includes(offer.license.usage)) {
    ruleCodes.push("LICENSE_NOT_ALLOWED");
  }
  if (!mandate.supportedDeliveryTypes.includes(offer.deliveryType)) {
    ruleCodes.push("DELIVERY_TYPE_UNSUPPORTED");
  }
  if (
    walletsMatch(context.buyerWalletAddress, offer.seller.walletAddress) &&
    !hasSelfDealingException(offer, mandate)
  ) {
    ruleCodes.push("SELF_DEALING_RISK");
  }
  if (decision.confidenceBps < 8500) ruleCodes.push("LOW_CONFIDENCE");
  if (!context.providerHealth[offer.rail]) {
    ruleCodes.push("PROVIDER_CONFIGURATION_UNHEALTHY");
  }
  if (context.terminalIdempotencyKeys.has(context.idempotencyKey)) {
    ruleCodes.push("DUPLICATE_TERMINAL_ATTEMPT");
  }
  if (offer.securitySignals.includes("prompt_injection")) {
    ruleCodes.push("PROMPT_INJECTION_DETECTED");
  }
  if (offer.securitySignals.includes("credential_request")) {
    ruleCodes.push("CREDENTIAL_REQUEST_DETECTED");
  }
  if (offer.securitySignals.includes("untrusted_executable")) {
    ruleCodes.push("UNTRUSTED_EXECUTABLE");
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
    ...(disposition === "allowed"
      ? { committedSpendAfter: projectedSpend }
      : {}),
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
