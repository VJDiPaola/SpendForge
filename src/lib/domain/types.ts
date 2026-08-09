export type Id = string;
export type ISODateTime = string;
export type HexAddress = `0x${string}`;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type MoneyAsset = "USD" | "rUSD" | "USDC";
export type MoneyNetwork = "rain-sandbox" | "eip155:10143";

/**
 * An amount is always an unsigned integer string in the asset's atomic unit.
 * JavaScript numbers are deliberately excluded from the contract.
 */
export type Money = {
  amount: string;
  decimals: number;
  asset: MoneyAsset;
  network?: MoneyNetwork;
};

/**
 * A fixture-only quote used to compare sandbox USD and test USDC in one demo
 * mandate. It is an accounting assumption, not a market or oracle price.
 */
export type DemoParityQuote = {
  id: Id;
  baseAsset: "USDC";
  baseAtomicAmount: string;
  baseDecimals: 6;
  quoteAsset: "USD";
  quoteAtomicAmount: string;
  quoteDecimals: 2;
  accountingDecimals: 6;
  asOf: ISODateTime;
  mode: "fixture-assumption";
  disclosure: string;
};

export type NormalizedBudgetAmount = {
  amount: string;
  decimals: 6;
  unit: "DEMO_USD";
  quoteId: Id;
};

export type ResourceType =
  | "data"
  | "component"
  | "media"
  | "compute"
  | "service"
  | "product";

export type PaymentRail = "free" | "rain_card" | "monad_x402";
export type Provenance = "seeded" | "signed" | "verified";
export type LicenseUsage = "demo-only" | "permissive" | "commercial";
export type DeliveryType = "manifest" | "asset" | "json" | "compute_job";
export type SecuritySignal =
  | "prompt_injection"
  | "credential_request"
  | "untrusted_executable";

export type SellerIdentity = {
  id: Id;
  displayName: string;
  kind: "merchant" | "wallet" | "catalog";
  synthetic: boolean;
  disclosedDemoSupplier: boolean;
  walletAddress?: HexAddress;
};

export type ResourceOffer = {
  id: Id;
  version: number;
  seller: SellerIdentity;
  title: string;
  description: string;
  type: ResourceType;
  rail: PaymentRail;
  price: Money;
  deliveryType: DeliveryType;
  provenance: Provenance;
  synthetic: boolean;
  required: boolean;
  license: {
    label: string;
    usage: LicenseUsage;
    sourceUrl?: string;
  };
  contentHash?: string;
  securitySignals: SecuritySignal[];
  active: boolean;
};

export type SuccessCriterion = {
  id: Id;
  label: string;
  required: boolean;
};

export type Mission = {
  id: Id;
  title: string;
  objective: string;
  status: "ready" | "running" | "completed" | "failed";
  templateKey: "atlas-launch-v1";
  mandateId: Id;
  successCriteria: SuccessCriterion[];
  synthetic: true;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type DemoSupplierMode = {
  enabled: boolean;
  disclosure: string;
  /**
   * Same-wallet purchasing is still denied unless an offer is named here.
   * Keeping this list explicit prevents "demo mode" from becoming a bypass.
   */
  selfDealingExceptionOfferIds: Id[];
};

export type Mandate = {
  id: Id;
  totalBudget: Money;
  perPurchaseCap: Money;
  authorityCeiling: Money;
  parityQuoteId: Id;
  allowedResourceTypes: ResourceType[];
  allowedSellerIds: Id[];
  allowedRails: PaymentRail[];
  allowedLicenseUsages: LicenseUsage[];
  supportedDeliveryTypes: DeliveryType[];
  minimumProvenance: Provenance;
  deadline: ISODateTime;
  version: number;
  demoSupplierMode: DemoSupplierMode;
};

export type PurchaseAction = "buy" | "decline" | "block" | "escalate";

export type PurchaseDecision = {
  offerId: Id;
  action: PurchaseAction;
  confidenceBps: number;
  expectedContribution: string;
  evidenceRequired: string[];
  summary: {
    whyConsidered: string;
    whyAction: string;
  };
};

export type PolicyRuleCode =
  | "POLICY_OK"
  | "OFFER_SCHEMA_INVALID"
  | "OFFER_INACTIVE"
  | "RAIL_NOT_ALLOWED"
  | "RESOURCE_TYPE_NOT_ALLOWED"
  | "SELLER_NOT_ALLOWED"
  | "PER_PURCHASE_CAP_EXCEEDED"
  | "TOTAL_BUDGET_EXCEEDED"
  | "MANDATE_EXPIRED"
  | "PROVENANCE_TOO_LOW"
  | "LICENSE_NOT_ALLOWED"
  | "DELIVERY_TYPE_UNSUPPORTED"
  | "SELF_DEALING_RISK"
  | "LOW_CONFIDENCE"
  | "PROVIDER_CONFIGURATION_UNHEALTHY"
  | "DUPLICATE_TERMINAL_ATTEMPT"
  | "PROMPT_INJECTION_DETECTED"
  | "CREDENTIAL_REQUEST_DETECTED"
  | "UNTRUSTED_EXECUTABLE";

export type PolicyResult = {
  eligible: boolean;
  disposition: "allowed" | "blocked" | "escalate";
  ruleCodes: PolicyRuleCode[];
  committedSpendBefore: NormalizedBudgetAmount;
  committedSpendAfter?: NormalizedBudgetAmount;
  mandateVersion: number;
  evaluatedAt: ISODateTime;
};

export type OfferLifecycleState =
  | "selected"
  | "declined"
  | "blocked"
  | "escalated"
  | "payment_pending"
  | "paid"
  | "delivered"
  | "delivery_failed"
  | "outcome_passed"
  | "outcome_failed";

export type OfferResult = {
  offerId: Id;
  offerVersion: number;
  finalAction: PurchaseAction;
  state: OfferLifecycleState;
  decision: PurchaseDecision;
  policy: PolicyResult;
  paymentAttemptId?: Id;
  deliveryEvidenceId?: Id;
  outcomeEvidenceId?: Id;
};

export type PaymentProviderState =
  | "created"
  | "pending"
  | "authorized"
  | "settlement_pending"
  | "settled"
  | "declined"
  | "failed"
  | "unknown";

export type EvidenceMode =
  | "fixture"
  | "provider-readback"
  | "chain-receipt"
  | "replay";

export type PaymentReceiptEvidence = {
  kind: "fixture-receipt" | "rain-readback" | "x402-chain-receipt";
  reference: string;
  verifiedAt?: ISODateTime;
  transactionUrl?: string;
};

export type PaymentAttempt = {
  id: Id;
  runId: Id;
  offerId: Id;
  rail: Exclude<PaymentRail, "free">;
  environment: "rain-sandbox" | "monad-testnet";
  amount: Money;
  providerState: PaymentProviderState;
  evidenceMode: EvidenceMode;
  authoritative: boolean;
  truthLabel: string;
  idempotencyKey: string;
  providerReference: string;
  receipt?: PaymentReceiptEvidence;
  lastReconciledAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type DeliveryEvidence = {
  id: Id;
  paymentAttemptId?: Id;
  offerId: Id;
  state: "pending" | "delivered" | "failed";
  evidenceMode: EvidenceMode;
  truthLabel: string;
  contentHash?: string;
  manifestVersion?: number;
  storageRef?: string;
  deliveredAt?: ISODateTime;
  errorCode?: string;
};

export type OutcomeCheck = {
  code: string;
  label: string;
  passed: boolean;
  evidence: string;
};

export type OutcomeEvidence = {
  id: Id;
  offerId: Id;
  deliveryEvidenceId: Id;
  state: "not_evaluated" | "passed" | "failed";
  evidenceMode: EvidenceMode;
  truthLabel: string;
  contribution: string;
  checks: OutcomeCheck[];
  evaluatedAt?: ISODateTime;
};

export type Artifact = {
  id: Id;
  runId: Id;
  slug: string;
  manifestVersion: number;
  resourceOfferVersions: Array<{ offerId: Id; version: number }>;
  public: boolean;
  evidenceMode: EvidenceMode;
  truthLabel: string;
  createdAt: ISODateTime;
};

export type Evaluation = {
  id: Id;
  artifactId: Id;
  evaluatorVersion: string;
  checks: OutcomeCheck[];
  passed: boolean;
  scoreBps: number;
  evidenceMode: EvidenceMode;
  truthLabel: string;
  createdAt: ISODateTime;
};

export type AutonomyProposal = {
  id: Id;
  runId: Id;
  currentPerPurchaseCap: Money;
  proposedPerPurchaseCap: Money;
  ceiling: Money;
  rationale: string[];
  state: "proposed" | "accepted_by_operator" | "rejected_by_operator";
  appliedToRain: false;
  evidenceMode: EvidenceMode;
  truthLabel: string;
};

export type MissionRunStatus =
  | "draft"
  | "planning"
  | "policy_checked"
  | "purchasing"
  | "delivering"
  | "composing"
  | "evaluating"
  | "completed"
  | "failed"
  | "reconciliation_required";

export type RunEventType =
  | "run.started"
  | "plan.created"
  | "offer.considered"
  | "offer.declined"
  | "offer.blocked"
  | "offer.escalated"
  | "policy.passed"
  | "payment.started"
  | "payment.authorized"
  | "payment.settled"
  | "payment.reconciliation_required"
  | "resource.delivered"
  | "resource.delivery_failed"
  | "artifact.composed"
  | "evaluation.completed"
  | "authority.proposed"
  | "run.completed"
  | "run.failed";

export type RunEvent = {
  sequence: number;
  runId: Id;
  type: RunEventType;
  occurredAt: ISODateTime;
  publicPayload: Record<string, JsonValue>;
};

export type MissionRun = {
  schemaVersion: 1;
  id: Id;
  executionMode: "fixture" | "live" | "replay";
  truthLabel: string;
  status: MissionRunStatus;
  mission: Mission;
  mandate: Mandate;
  parityQuote: DemoParityQuote;
  offers: ResourceOffer[];
  offerResults: OfferResult[];
  payments: PaymentAttempt[];
  deliveries: DeliveryEvidence[];
  outcomes: OutcomeEvidence[];
  artifact?: Artifact;
  evaluation?: Evaluation;
  autonomyProposal?: AutonomyProposal;
  events: RunEvent[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};
