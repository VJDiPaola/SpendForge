import type {
  CheckoutAmount,
  CheckoutInspectState,
  CheckoutInspectionInput,
  CheckoutMandate,
  CheckoutPolicyCode,
  CheckoutPolicyEvaluation,
  CheckoutPolicyState,
  CheckoutQuoteInput,
  CheckoutQuoteState,
  CheckoutReceiptInput,
  CheckoutReceiptState,
  CheckoutRequiresHumanState,
  CheckoutSubmitState,
  CheckoutUsage,
  HumanApprovalEvent,
  HumanApprovalEventStatus,
  HumanApprovalJournal,
  HumanApprovalJournalRecord,
  HumanApprovalReason,
} from "@/lib/checkout/contracts";

export const checkoutContractErrorCodeValues = [
  "INVALID_INPUT",
  "POLICY_DENIED",
  "APPROVAL_PENDING",
  "APPROVAL_DECISION_CONFLICT",
  "APPROVAL_JOURNAL_REQUIRED",
  "APPROVAL_JOURNAL_MISMATCH",
  "RECEIPT_MISMATCH",
] as const;

export type CheckoutContractErrorCode =
  (typeof checkoutContractErrorCodeValues)[number];

export class CheckoutContractError extends Error {
  constructor(readonly code: CheckoutContractErrorCode) {
    super(code);
    this.name = "CheckoutContractError";
  }
}

export interface CheckoutClock {
  now(): Date;
}

export type CheckoutOperatorOptions = Readonly<{
  approvalJournal: HumanApprovalJournal;
  clock?: CheckoutClock;
  approvalTimeoutMs?: number;
}>;

export type HumanApprovalDecision = Readonly<{
  status: "approved" | "denied";
}>;

const DEFAULT_APPROVAL_TIMEOUT_MS = 5 * 60 * 1_000;
const integerAmountPattern = /^(0|[1-9]\d*)$/;
const safeIdPattern = /^[A-Za-z0-9._:-]+$/;

function requireNonEmpty(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new CheckoutContractError("INVALID_INPUT");
  }
  return normalized;
}

function requireSafeId(value: string): string {
  const normalized = requireNonEmpty(value);
  if (!safeIdPattern.test(normalized)) {
    throw new CheckoutContractError("INVALID_INPUT");
  }
  return normalized;
}

function requireInstant(value: string): number {
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) {
    throw new CheckoutContractError("INVALID_INPUT");
  }
  return instant;
}

function requireAmount(value: CheckoutAmount): CheckoutAmount {
  if (
    !integerAmountPattern.test(value.amountAtomic) ||
    !Number.isInteger(value.decimals) ||
    value.decimals < 0 ||
    value.decimals > 18 ||
    !value.asset.trim()
  ) {
    throw new CheckoutContractError("INVALID_INPUT");
  }
  return value;
}

function sameDenomination(left: CheckoutAmount, right: CheckoutAmount): boolean {
  return (
    left.asset.toLowerCase() === right.asset.toLowerCase() &&
    left.decimals === right.decimals
  );
}

function sameAmount(left: CheckoutAmount, right: CheckoutAmount): boolean {
  return (
    sameDenomination(left, right) &&
    left.amountAtomic === right.amountAtomic
  );
}

function addAmount(left: CheckoutAmount, right: CheckoutAmount): CheckoutAmount {
  if (!sameDenomination(left, right)) {
    throw new CheckoutContractError("INVALID_INPUT");
  }
  return {
    amountAtomic: (BigInt(left.amountAtomic) + BigInt(right.amountAtomic)).toString(),
    asset: left.asset,
    decimals: left.decimals,
  };
}

function normalizedDomain(value: string): string {
  const candidate = requireNonEmpty(value).toLowerCase().replace(/\.+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(`https://${candidate}`);
  } catch {
    throw new CheckoutContractError("INVALID_INPUT");
  }
  if (parsed.hostname !== candidate || parsed.pathname !== "/") {
    throw new CheckoutContractError("INVALID_INPUT");
  }
  return candidate;
}

function checkoutHostname(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new CheckoutContractError("INVALID_INPUT");
  }
  if (parsed.protocol !== "https:") {
    throw new CheckoutContractError("INVALID_INPUT");
  }
  return normalizedDomain(parsed.hostname);
}

function domainAllowed(hostname: string, allowlist: readonly string[]): boolean {
  return allowlist.some((entry) => {
    const allowed = normalizedDomain(entry);
    return hostname === allowed || hostname.endsWith(`.${allowed}`);
  });
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function minimumExpiry(...values: readonly number[]): string {
  return new Date(Math.min(...values)).toISOString();
}

function stableApprovalFieldsMatch(
  expected: HumanApprovalEvent,
  actual: HumanApprovalEvent,
): boolean {
  return (
    expected.approvalId === actual.approvalId &&
    expected.merchant.id === actual.merchant.id &&
    expected.merchant.displayName === actual.merchant.displayName &&
    expected.merchant.domain === actual.merchant.domain &&
    expected.merchant.category === actual.merchant.category &&
    expected.resource.id === actual.resource.id &&
    expected.resource.title === actual.resource.title &&
    sameAmount(expected.amount, actual.amount) &&
    expected.reason.length === actual.reason.length &&
    expected.reason.every((reason, index) => reason === actual.reason[index]) &&
    expected.policy.mandateId === actual.policy.mandateId &&
    expected.policy.mandateVersion === actual.policy.mandateVersion &&
    expected.policy.acceptedTermsVersion ===
      actual.policy.acceptedTermsVersion &&
    expected.policy.quotedTermsVersion === actual.policy.quotedTermsVersion &&
    expected.policy.recurringAllowedByMandate ===
      actual.policy.recurringAllowedByMandate &&
    expected.policy.ruleCodes.length === actual.policy.ruleCodes.length &&
    expected.policy.ruleCodes.every(
      (code, index) => code === actual.policy.ruleCodes[index],
    ) &&
    expected.expiry === actual.expiry
  );
}

/**
 * Local deterministic checkout authority. It always evaluates the mandate
 * before creating a submission intent and never performs network, messaging,
 * browser automation, payment, or credential-handling work itself.
 */
export class CheckoutOperator {
  private readonly clock: CheckoutClock;
  private readonly approvalTimeoutMs: number;

  constructor(private readonly options: CheckoutOperatorOptions) {
    this.clock = options.clock ?? { now: () => new Date() };
    this.approvalTimeoutMs =
      options.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
    if (
      !Number.isInteger(this.approvalTimeoutMs) ||
      this.approvalTimeoutMs <= 0
    ) {
      throw new CheckoutContractError("INVALID_INPUT");
    }
  }

  inspect(input: CheckoutInspectionInput): CheckoutInspectState {
    requireSafeId(input.checkoutId);
    requireSafeId(input.merchant.id);
    requireSafeId(input.resource.id);
    requireNonEmpty(input.merchant.displayName);
    normalizedDomain(input.merchant.domain);
    requireNonEmpty(input.merchant.category);
    requireNonEmpty(input.resource.title);
    checkoutHostname(input.checkoutUrl);

    return {
      stage: "inspect",
      inspectedAt: this.clock.now().toISOString(),
      input: {
        ...input,
        challenges: unique(input.challenges ?? []),
      },
    };
  }

  quote(
    inspection: CheckoutInspectState,
    quote: CheckoutQuoteInput,
  ): CheckoutQuoteState {
    requireSafeId(quote.quoteId);
    requireAmount(quote.amount);
    requireNonEmpty(quote.termsVersion);
    requireInstant(quote.expiresAt);

    return {
      stage: "quote",
      quotedAt: this.clock.now().toISOString(),
      inspection,
      quote,
    };
  }

  evaluatePolicy(
    quoteState: CheckoutQuoteState,
    mandate: CheckoutMandate,
    usage: CheckoutUsage,
  ): CheckoutPolicyState | CheckoutRequiresHumanState {
    this.validateMandate(mandate, usage);
    const now = this.clock.now();
    const nowMs = now.getTime();
    const quote = quoteState.quote;
    const inspection = quoteState.inspection.input;
    const policyCodes: CheckoutPolicyCode[] = [];
    const humanReasons: HumanApprovalReason[] = [];
    const actualDomain = checkoutHostname(inspection.checkoutUrl);
    const declaredDomain = normalizedDomain(inspection.merchant.domain);

    if (actualDomain !== declaredDomain) {
      policyCodes.push("CHECKOUT_DOMAIN_MISMATCH");
    }
    if (!domainAllowed(actualDomain, mandate.allowedDomains)) {
      policyCodes.push("DOMAIN_NOT_ALLOWED");
    }
    if (
      !mandate.allowedCategories.some(
        (category) =>
          category.trim().toLowerCase() ===
          inspection.merchant.category.trim().toLowerCase(),
      )
    ) {
      policyCodes.push("CATEGORY_NOT_ALLOWED");
    }

    const denominationsMatch =
      sameDenomination(quote.amount, mandate.perTransactionCap) &&
      sameDenomination(quote.amount, mandate.cumulativeCap) &&
      sameDenomination(quote.amount, usage.committedSpend);
    let committedSpendAfter = usage.committedSpend;
    if (!denominationsMatch) {
      policyCodes.push("MONEY_DENOMINATION_MISMATCH");
    } else {
      committedSpendAfter = addAmount(usage.committedSpend, quote.amount);
      if (
        BigInt(quote.amount.amountAtomic) >
        BigInt(mandate.perTransactionCap.amountAtomic)
      ) {
        policyCodes.push("PER_TRANSACTION_CAP_EXCEEDED");
      }
      if (
        BigInt(committedSpendAfter.amountAtomic) >
        BigInt(mandate.cumulativeCap.amountAtomic)
      ) {
        policyCodes.push("CUMULATIVE_CAP_EXCEEDED");
      }
    }

    if (usage.purchaseCount >= mandate.maxPurchases) {
      policyCodes.push("PURCHASE_COUNT_EXCEEDED");
    }
    if (nowMs >= requireInstant(mandate.expiresAt)) {
      policyCodes.push("MANDATE_EXPIRED");
    }
    if (nowMs >= requireInstant(quote.expiresAt)) {
      policyCodes.push("QUOTE_EXPIRED");
    }

    for (const challenge of inspection.challenges ?? []) {
      if (challenge === "captcha") humanReasons.push("CAPTCHA_REQUIRED");
      if (challenge === "three_ds") humanReasons.push("THREE_DS_REQUIRED");
      if (challenge === "fraud_review") {
        humanReasons.push("FRAUD_REVIEW_REQUIRED");
      }
    }
    if (quote.termsVersion !== mandate.acceptedTermsVersion) {
      humanReasons.push("NEW_TERMS");
    }
    // Recurring purchases always require a human. Omitting allowRecurring is
    // the conservative default and grants no recurring authority.
    if (quote.recurring) humanReasons.push("SUBSCRIPTION");
    if (quote.irreversibleCommit) {
      humanReasons.push("IRREVERSIBLE_COMMIT");
    }

    const hardCodes = unique(policyCodes);
    const handoffReasons = unique(humanReasons);
    const evaluation: CheckoutPolicyEvaluation = {
      disposition:
        hardCodes.length > 0
          ? "DENY"
          : handoffReasons.length > 0
            ? "REQUIRES_HUMAN"
            : "ALLOW",
      policy: {
        mandateId: mandate.id,
        mandateVersion: mandate.version,
        acceptedTermsVersion: mandate.acceptedTermsVersion,
        quotedTermsVersion: quote.termsVersion,
        recurringAllowedByMandate: mandate.allowRecurring === true,
        ruleCodes: hardCodes.length > 0 ? hardCodes : ["POLICY_OK"],
      },
      humanReasons: handoffReasons,
      committedSpendAfter,
      purchaseCountAfter: usage.purchaseCount + 1,
    };

    if (evaluation.disposition !== "REQUIRES_HUMAN") {
      return {
        stage: "policy",
        evaluatedAt: now.toISOString(),
        quoteState,
        mandate,
        usage,
        evaluation,
      };
    }

    const expiry = minimumExpiry(
      nowMs + this.approvalTimeoutMs,
      requireInstant(mandate.expiresAt),
      requireInstant(quote.expiresAt),
    );
    return {
      stage: "requiresHuman",
      quoteState,
      mandate,
      usage,
      evaluation,
      approval: {
        approvalId: this.approvalId(quoteState, mandate),
        checkoutId: inspection.checkoutId,
        merchant: inspection.merchant,
        resource: inspection.resource,
        amount: quote.amount,
        reason: handoffReasons,
        policy: evaluation.policy,
        requestedAt: now.toISOString(),
        expiry,
        status: "pending",
      },
    };
  }

  prepareSubmission(state: CheckoutPolicyState): CheckoutSubmitState {
    if (state.evaluation.disposition !== "ALLOW") {
      throw new CheckoutContractError("POLICY_DENIED");
    }
    return this.submissionFrom(
      state.quoteState,
      state.evaluation,
      state.evaluatedAt,
    );
  }

  async decideHumanApproval(
    state: CheckoutRequiresHumanState,
    decision: HumanApprovalDecision,
  ): Promise<CheckoutSubmitState | CheckoutRequiresHumanState> {
    const now = this.clock.now();
    const status: HumanApprovalEventStatus =
      now.getTime() >= requireInstant(state.approval.expiry)
        ? "timed_out_denied"
        : decision.status;
    return this.recordDecision(state, status, now);
  }

  async expireHumanApproval(
    state: CheckoutRequiresHumanState,
  ): Promise<CheckoutRequiresHumanState> {
    const now = this.clock.now();
    if (now.getTime() < requireInstant(state.approval.expiry)) {
      throw new CheckoutContractError("APPROVAL_PENDING");
    }
    const result = await this.recordDecision(state, "timed_out_denied", now);
    if (result.stage !== "requiresHuman") {
      throw new CheckoutContractError("APPROVAL_DECISION_CONFLICT");
    }
    return result;
  }

  recordReceipt(
    submission: CheckoutSubmitState,
    receipt: CheckoutReceiptInput,
  ): CheckoutReceiptState {
    requireAmount(receipt.amount);
    requireNonEmpty(receipt.evidenceRef);
    requireInstant(receipt.observedAt);
    if (
      !sameAmount(submission.amount, receipt.amount) ||
      (receipt.status === "confirmed" && !receipt.authoritative)
    ) {
      throw new CheckoutContractError("RECEIPT_MISMATCH");
    }
    return { stage: "receipt", submission, receipt };
  }

  private validateMandate(
    mandate: CheckoutMandate,
    usage: CheckoutUsage,
  ): void {
    requireSafeId(mandate.id);
    if (
      !Number.isInteger(mandate.version) ||
      mandate.version < 1 ||
      mandate.allowedDomains.length === 0 ||
      mandate.allowedCategories.length === 0 ||
      !Number.isInteger(mandate.maxPurchases) ||
      mandate.maxPurchases < 1 ||
      !Number.isInteger(usage.purchaseCount) ||
      usage.purchaseCount < 0
    ) {
      throw new CheckoutContractError("INVALID_INPUT");
    }
    mandate.allowedDomains.forEach(normalizedDomain);
    mandate.allowedCategories.forEach(requireNonEmpty);
    requireAmount(mandate.perTransactionCap);
    requireAmount(mandate.cumulativeCap);
    requireAmount(usage.committedSpend);
    requireInstant(mandate.expiresAt);
    requireNonEmpty(mandate.acceptedTermsVersion);
  }

  private approvalId(
    quoteState: CheckoutQuoteState,
    mandate: CheckoutMandate,
  ): string {
    return [
      "approval",
      requireSafeId(quoteState.inspection.input.checkoutId),
      requireSafeId(quoteState.quote.quoteId),
      requireSafeId(mandate.id),
      `v${mandate.version}`,
    ].join(":");
  }

  private async recordDecision(
    state: CheckoutRequiresHumanState,
    status: HumanApprovalEventStatus,
    now: Date,
  ): Promise<CheckoutSubmitState | CheckoutRequiresHumanState> {
    const event: HumanApprovalEvent = {
      approvalId: state.approval.approvalId,
      merchant: state.approval.merchant,
      resource: state.approval.resource,
      amount: state.approval.amount,
      reason: state.approval.reason,
      policy: state.approval.policy,
      expiry: state.approval.expiry,
      status,
      decidedAt: now.toISOString(),
    };

    let journalRecord: HumanApprovalJournalRecord;
    try {
      journalRecord = await this.options.approvalJournal.appendOnce(event);
    } catch {
      throw new CheckoutContractError("APPROVAL_JOURNAL_REQUIRED");
    }
    if (!stableApprovalFieldsMatch(event, journalRecord.event)) {
      throw new CheckoutContractError("APPROVAL_JOURNAL_MISMATCH");
    }
    if (!journalRecord.journalRef.trim()) {
      throw new CheckoutContractError("APPROVAL_JOURNAL_MISMATCH");
    }
    if (journalRecord.event.status !== status) {
      throw new CheckoutContractError("APPROVAL_DECISION_CONFLICT");
    }

    if (journalRecord.event.status !== "approved") {
      return { ...state, terminalDecision: journalRecord };
    }
    return this.submissionFrom(
      state.quoteState,
      state.evaluation,
      journalRecord.event.decidedAt,
      journalRecord,
    );
  }

  private submissionFrom(
    quoteState: CheckoutQuoteState,
    evaluation: CheckoutPolicyEvaluation,
    preparedAt: string,
    approvalEvidence?: HumanApprovalJournalRecord,
  ): CheckoutSubmitState {
    const checkoutId = quoteState.inspection.input.checkoutId;
    const quoteId = quoteState.quote.quoteId;
    return {
      stage: "submit",
      preparedAt,
      checkoutId,
      quoteId,
      merchant: quoteState.inspection.input.merchant,
      resource: quoteState.inspection.input.resource,
      amount: quoteState.quote.amount,
      idempotencyKey: [
        "checkout",
        requireSafeId(checkoutId),
        requireSafeId(quoteId),
        requireSafeId(evaluation.policy.mandateId),
        `v${evaluation.policy.mandateVersion}`,
      ].join(":"),
      policy: evaluation.policy,
      ...(approvalEvidence ? { approvalEvidence } : {}),
    };
  }
}

/** Local test/demo journal; deployed checkout code must provide a durable CAS store. */
export class InMemoryHumanApprovalJournal implements HumanApprovalJournal {
  private readonly records = new Map<string, HumanApprovalJournalRecord>();

  async appendOnce(event: HumanApprovalEvent): Promise<HumanApprovalJournalRecord> {
    const existing = this.records.get(event.approvalId);
    if (existing) {
      return { ...existing, outcome: "existing" };
    }
    const record: HumanApprovalJournalRecord = {
      outcome: "recorded",
      journalRef: `local-approval:${event.approvalId}`,
      event,
    };
    this.records.set(event.approvalId, record);
    return record;
  }

  read(approvalId: string): HumanApprovalJournalRecord | undefined {
    return this.records.get(approvalId);
  }

  get size(): number {
    return this.records.size;
  }
}
