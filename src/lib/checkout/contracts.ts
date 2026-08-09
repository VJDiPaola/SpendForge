export const checkoutStageValues = [
  "inspect",
  "quote",
  "policy",
  "submit",
  "receipt",
  "requiresHuman",
] as const;

export type CheckoutStage = (typeof checkoutStageValues)[number];

export type CheckoutAmount = Readonly<{
  amountAtomic: string;
  asset: string;
  decimals: number;
}>;

export type CheckoutMerchant = Readonly<{
  id: string;
  displayName: string;
  domain: string;
  category: string;
}>;

export type CheckoutResource = Readonly<{
  id: string;
  title: string;
}>;

export type CheckoutMandate = Readonly<{
  id: string;
  version: number;
  allowedDomains: readonly string[];
  allowedCategories: readonly string[];
  perTransactionCap: CheckoutAmount;
  cumulativeCap: CheckoutAmount;
  maxPurchases: number;
  expiresAt: string;
  allowRecurring?: boolean;
  acceptedTermsVersion: string;
}>;

export type CheckoutUsage = Readonly<{
  committedSpend: CheckoutAmount;
  purchaseCount: number;
}>;

export const checkoutChallengeValues = [
  "captcha",
  "three_ds",
  "fraud_review",
] as const;

export type CheckoutChallenge = (typeof checkoutChallengeValues)[number];

export type CheckoutInspectionInput = Readonly<{
  checkoutId: string;
  checkoutUrl: string;
  merchant: CheckoutMerchant;
  resource: CheckoutResource;
  challenges?: readonly CheckoutChallenge[];
}>;

export type CheckoutQuoteInput = Readonly<{
  quoteId: string;
  amount: CheckoutAmount;
  termsVersion: string;
  recurring: boolean;
  irreversibleCommit: boolean;
  expiresAt: string;
}>;

export const checkoutPolicyCodeValues = [
  "POLICY_OK",
  "CHECKOUT_DOMAIN_MISMATCH",
  "DOMAIN_NOT_ALLOWED",
  "CATEGORY_NOT_ALLOWED",
  "MONEY_DENOMINATION_MISMATCH",
  "PER_TRANSACTION_CAP_EXCEEDED",
  "CUMULATIVE_CAP_EXCEEDED",
  "PURCHASE_COUNT_EXCEEDED",
  "MANDATE_EXPIRED",
  "QUOTE_EXPIRED",
] as const;

export type CheckoutPolicyCode = (typeof checkoutPolicyCodeValues)[number];

export const humanApprovalReasonValues = [
  "CAPTCHA_REQUIRED",
  "THREE_DS_REQUIRED",
  "FRAUD_REVIEW_REQUIRED",
  "NEW_TERMS",
  "SUBSCRIPTION",
  "IRREVERSIBLE_COMMIT",
] as const;

export type HumanApprovalReason =
  (typeof humanApprovalReasonValues)[number];

export type CheckoutPolicySnapshot = Readonly<{
  mandateId: string;
  mandateVersion: number;
  acceptedTermsVersion: string;
  quotedTermsVersion: string;
  recurringAllowedByMandate: boolean;
  ruleCodes: readonly CheckoutPolicyCode[];
}>;

export type CheckoutPolicyEvaluation = Readonly<{
  disposition: "ALLOW" | "DENY" | "REQUIRES_HUMAN";
  policy: CheckoutPolicySnapshot;
  humanReasons: readonly HumanApprovalReason[];
  committedSpendAfter: CheckoutAmount;
  purchaseCountAfter: number;
}>;

export type CheckoutInspectState = Readonly<{
  stage: "inspect";
  inspectedAt: string;
  input: CheckoutInspectionInput;
}>;

export type CheckoutQuoteState = Readonly<{
  stage: "quote";
  quotedAt: string;
  inspection: CheckoutInspectState;
  quote: CheckoutQuoteInput;
}>;

export type CheckoutPolicyState = Readonly<{
  stage: "policy";
  evaluatedAt: string;
  quoteState: CheckoutQuoteState;
  mandate: CheckoutMandate;
  usage: CheckoutUsage;
  evaluation: CheckoutPolicyEvaluation;
}>;

export type HumanApprovalRequest = Readonly<{
  approvalId: string;
  checkoutId: string;
  merchant: CheckoutMerchant;
  resource: CheckoutResource;
  amount: CheckoutAmount;
  reason: readonly HumanApprovalReason[];
  policy: CheckoutPolicySnapshot;
  requestedAt: string;
  expiry: string;
  status: "pending";
}>;

export const humanApprovalEventStatusValues = [
  "approved",
  "denied",
  "timed_out_denied",
] as const;

export type HumanApprovalEventStatus =
  (typeof humanApprovalEventStatusValues)[number];

/**
 * Public-safe human decision evidence. It intentionally has no payment-card,
 * credential, browser-session, or provider-payload fields.
 */
export type HumanApprovalEvent = Readonly<{
  approvalId: string;
  merchant: CheckoutMerchant;
  resource: CheckoutResource;
  amount: CheckoutAmount;
  reason: readonly HumanApprovalReason[];
  policy: CheckoutPolicySnapshot;
  expiry: string;
  status: HumanApprovalEventStatus;
  decidedAt: string;
}>;

export type HumanApprovalJournalRecord = Readonly<{
  outcome: "recorded" | "existing";
  journalRef: string;
  event: HumanApprovalEvent;
}>;

/**
 * Durable implementations must atomically append once by approvalId. Returning
 * an existing record is the idempotent path; overwriting is never allowed.
 */
export interface HumanApprovalJournal {
  appendOnce(event: HumanApprovalEvent): Promise<HumanApprovalJournalRecord>;
}

/**
 * Type-only seam for future Slack or email notification adapters. The checkout
 * operator does not invoke a transport, and adapters must receive this redacted
 * request rather than browser state, credentials, or payment-card data.
 */
export interface HumanApprovalNotificationAdapter {
  notify(request: HumanApprovalRequest): Promise<{
    accepted: boolean;
    deliveryRef?: string;
  }>;
}

export type CheckoutRequiresHumanState = Readonly<{
  stage: "requiresHuman";
  quoteState: CheckoutQuoteState;
  mandate: CheckoutMandate;
  usage: CheckoutUsage;
  evaluation: CheckoutPolicyEvaluation;
  approval: HumanApprovalRequest;
  terminalDecision?: HumanApprovalJournalRecord;
}>;

export type CheckoutSubmitState = Readonly<{
  stage: "submit";
  preparedAt: string;
  checkoutId: string;
  quoteId: string;
  merchant: CheckoutMerchant;
  resource: CheckoutResource;
  amount: CheckoutAmount;
  idempotencyKey: string;
  policy: CheckoutPolicySnapshot;
  approvalEvidence?: HumanApprovalJournalRecord;
}>;

export type CheckoutReceiptInput = Readonly<{
  status: "confirmed" | "failed" | "unknown";
  authoritative: boolean;
  amount: CheckoutAmount;
  evidenceRef: string;
  observedAt: string;
}>;

export type CheckoutReceiptState = Readonly<{
  stage: "receipt";
  submission: CheckoutSubmitState;
  receipt: CheckoutReceiptInput;
}>;

export type CheckoutState =
  | CheckoutInspectState
  | CheckoutQuoteState
  | CheckoutPolicyState
  | CheckoutRequiresHumanState
  | CheckoutSubmitState
  | CheckoutReceiptState;
