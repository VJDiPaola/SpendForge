import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CheckoutContractError,
  CheckoutOperator,
  InMemoryHumanApprovalJournal,
  type CheckoutClock,
  type CheckoutInspectionInput,
  type CheckoutMandate,
  type CheckoutPolicyState,
  type CheckoutQuoteInput,
  type CheckoutRequiresHumanState,
  type CheckoutUsage,
  type HumanApprovalJournal,
} from "@/lib/checkout";

class MutableClock implements CheckoutClock {
  constructor(private instant: string) {}

  now(): Date {
    return new Date(this.instant);
  }

  set(instant: string): void {
    this.instant = instant;
  }
}

const usd12 = {
  amountAtomic: "1200",
  asset: "USD",
  decimals: 2,
} as const;

const inspectionInput: CheckoutInspectionInput = {
  checkoutId: "checkout.atlas.northstar.v1",
  checkoutUrl: "https://checkout.northstar.example/buy",
  merchant: {
    id: "merchant.northstar",
    displayName: "Northstar",
    domain: "checkout.northstar.example",
    category: "licensed_media",
  },
  resource: {
    id: "resource.northstar.background.v1",
    title: "Northstar launch background",
  },
  challenges: [],
};

const quoteInput: CheckoutQuoteInput = {
  quoteId: "quote.northstar.001",
  amount: usd12,
  termsVersion: "terms-2026-08",
  recurring: false,
  irreversibleCommit: false,
  expiresAt: "2026-08-09T09:00:00.000Z",
};

const mandate: CheckoutMandate = {
  id: "mandate.atlas.v1",
  version: 1,
  allowedDomains: ["northstar.example"],
  allowedCategories: ["licensed_media"],
  perTransactionCap: {
    amountAtomic: "1500",
    asset: "USD",
    decimals: 2,
  },
  cumulativeCap: {
    amountAtomic: "3000",
    asset: "USD",
    decimals: 2,
  },
  maxPurchases: 2,
  expiresAt: "2026-08-09T10:00:00.000Z",
  acceptedTermsVersion: "terms-2026-08",
};

const usage: CheckoutUsage = {
  committedSpend: {
    amountAtomic: "1000",
    asset: "USD",
    decimals: 2,
  },
  purchaseCount: 1,
};

type Scenario = {
  clock?: MutableClock;
  journal?: HumanApprovalJournal;
  inspection?: CheckoutInspectionInput;
  quote?: CheckoutQuoteInput;
  mandate?: CheckoutMandate;
  usage?: CheckoutUsage;
};

function evaluate(scenario: Scenario = {}) {
  const clock =
    scenario.clock ?? new MutableClock("2026-08-09T08:00:00.000Z");
  const journal =
    scenario.journal ?? new InMemoryHumanApprovalJournal();
  const operator = new CheckoutOperator({
    approvalJournal: journal,
    clock,
    approvalTimeoutMs: 5 * 60 * 1_000,
  });
  const inspected = operator.inspect(scenario.inspection ?? inspectionInput);
  const quoted = operator.quote(inspected, scenario.quote ?? quoteInput);
  const state = operator.evaluatePolicy(
    quoted,
    scenario.mandate ?? mandate,
    scenario.usage ?? usage,
  );
  return { clock, journal, operator, inspected, quoted, state };
}

function asPolicy(state: ReturnType<typeof evaluate>["state"]): CheckoutPolicyState {
  expect(state.stage).toBe("policy");
  return state as CheckoutPolicyState;
}

function asHuman(
  state: ReturnType<typeof evaluate>["state"],
): CheckoutRequiresHumanState {
  expect(state.stage).toBe("requiresHuman");
  return state as CheckoutRequiresHumanState;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CheckoutOperator", () => {
  it("moves through inspect, quote, policy, submit, and receipt without network work", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { operator, inspected, quoted, state } = evaluate();
    const policy = asPolicy(state);

    expect(inspected.stage).toBe("inspect");
    expect(quoted.stage).toBe("quote");
    expect(policy.evaluation).toMatchObject({
      disposition: "ALLOW",
      committedSpendAfter: { amountAtomic: "2200" },
      purchaseCountAfter: 2,
      policy: { ruleCodes: ["POLICY_OK"] },
    });

    const submission = operator.prepareSubmission(policy);
    expect(submission).toMatchObject({
      stage: "submit",
      idempotencyKey:
        "checkout:checkout.atlas.northstar.v1:quote.northstar.001:mandate.atlas.v1:v1",
      amount: usd12,
    });

    const receipt = operator.recordReceipt(submission, {
      status: "confirmed",
      authoritative: true,
      amount: usd12,
      evidenceRef: "receipt:local:001",
      observedAt: "2026-08-09T08:00:01.000Z",
    });
    expect(receipt.stage).toBe("receipt");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(receipt)).not.toMatch(
      /"(?:pan|cvc|cardNumber|privateKey|authorization)"/i,
    );
  });

  it.each([
    {
      name: "non-allowlisted checkout domain",
      scenario: {
        inspection: {
          ...inspectionInput,
          checkoutUrl: "https://evil.example/buy",
          merchant: { ...inspectionInput.merchant, domain: "evil.example" },
        },
      },
      code: "DOMAIN_NOT_ALLOWED",
    },
    {
      name: "declared and actual domain mismatch",
      scenario: {
        inspection: {
          ...inspectionInput,
          checkoutUrl: "https://northstar.example/buy",
        },
      },
      code: "CHECKOUT_DOMAIN_MISMATCH",
    },
    {
      name: "non-allowlisted category",
      scenario: {
        inspection: {
          ...inspectionInput,
          merchant: { ...inspectionInput.merchant, category: "gambling" },
        },
      },
      code: "CATEGORY_NOT_ALLOWED",
    },
    {
      name: "per-transaction cap",
      scenario: {
        quote: {
          ...quoteInput,
          amount: { ...usd12, amountAtomic: "1501" },
        },
      },
      code: "PER_TRANSACTION_CAP_EXCEEDED",
    },
    {
      name: "cumulative cap",
      scenario: {
        usage: {
          ...usage,
          committedSpend: { ...usage.committedSpend, amountAtomic: "2000" },
        },
      },
      code: "CUMULATIVE_CAP_EXCEEDED",
    },
    {
      name: "purchase count",
      scenario: { usage: { ...usage, purchaseCount: 2 } },
      code: "PURCHASE_COUNT_EXCEEDED",
    },
    {
      name: "expired mandate",
      scenario: {
        mandate: { ...mandate, expiresAt: "2026-08-09T08:00:00.000Z" },
      },
      code: "MANDATE_EXPIRED",
    },
    {
      name: "expired quote",
      scenario: {
        quote: { ...quoteInput, expiresAt: "2026-08-09T08:00:00.000Z" },
      },
      code: "QUOTE_EXPIRED",
    },
    {
      name: "money denomination mismatch",
      scenario: {
        quote: {
          ...quoteInput,
          amount: { amountAtomic: "1200", asset: "USDC", decimals: 6 },
        },
      },
      code: "MONEY_DENOMINATION_MISMATCH",
    },
  ])("hard-denies $name", ({ scenario, code }) => {
    const { operator, state } = evaluate(scenario);
    const policy = asPolicy(state);

    expect(policy.evaluation.disposition).toBe("DENY");
    expect(policy.evaluation.policy.ruleCodes).toContain(code);
    expect(() => operator.prepareSubmission(policy)).toThrowError(
      expect.objectContaining({ code: "POLICY_DENIED" }),
    );
  });

  it.each([
    ["captcha", "CAPTCHA_REQUIRED"],
    ["three_ds", "THREE_DS_REQUIRED"],
    ["fraud_review", "FRAUD_REVIEW_REQUIRED"],
  ] as const)("hands off the %s challenge", (challenge, reason) => {
    const { state } = evaluate({
      inspection: { ...inspectionInput, challenges: [challenge] },
    });
    const human = asHuman(state);

    expect(human.evaluation.disposition).toBe("REQUIRES_HUMAN");
    expect(human.approval.reason).toContain(reason);
  });

  it("hands off new terms, subscriptions, and irreversible final commits", () => {
    const { state } = evaluate({
      quote: {
        ...quoteInput,
        termsVersion: "terms-2026-09",
        recurring: true,
        irreversibleCommit: true,
      },
    });
    const human = asHuman(state);

    expect(human.approval.reason).toEqual([
      "NEW_TERMS",
      "SUBSCRIPTION",
      "IRREVERSIBLE_COMMIT",
    ]);
    expect(human.approval.policy).toMatchObject({
      acceptedTermsVersion: "terms-2026-08",
      quotedTermsVersion: "terms-2026-09",
      recurringAllowedByMandate: false,
    });
  });

  it("requires human review for a subscription even when a mandate opts into recurring", () => {
    const { state } = evaluate({
      quote: { ...quoteInput, recurring: true },
      mandate: { ...mandate, allowRecurring: true },
    });
    const human = asHuman(state);

    expect(human.approval.reason).toEqual(["SUBSCRIPTION"]);
    expect(human.approval.policy.recurringAllowedByMandate).toBe(true);
  });

  it("journals the complete approval event before returning a resumable submission", async () => {
    const journal = new InMemoryHumanApprovalJournal();
    const { operator, state } = evaluate({
      journal,
      inspection: { ...inspectionInput, challenges: ["captcha"] },
    });
    const human = asHuman(state);

    const resumed = await operator.decideHumanApproval(human, {
      status: "approved",
    });

    expect(resumed.stage).toBe("submit");
    if (resumed.stage !== "submit") throw new Error("expected submit");
    expect(journal.size).toBe(1);
    expect(resumed.approvalEvidence).toMatchObject({
      outcome: "recorded",
      event: {
        merchant: inspectionInput.merchant,
        resource: inspectionInput.resource,
        amount: usd12,
        reason: ["CAPTCHA_REQUIRED"],
        policy: human.approval.policy,
        expiry: "2026-08-09T08:05:00.000Z",
        status: "approved",
      },
    });
  });

  it("makes repeated identical human decisions idempotent and rejects conflicts", async () => {
    const journal = new InMemoryHumanApprovalJournal();
    const { operator, state } = evaluate({
      journal,
      quote: { ...quoteInput, irreversibleCommit: true },
    });
    const human = asHuman(state);

    const first = await operator.decideHumanApproval(human, {
      status: "approved",
    });
    const second = await operator.decideHumanApproval(human, {
      status: "approved",
    });

    expect(first.stage).toBe("submit");
    expect(second.stage).toBe("submit");
    if (first.stage !== "submit" || second.stage !== "submit") {
      throw new Error("expected submit");
    }
    expect(journal.size).toBe(1);
    expect(second.approvalEvidence?.outcome).toBe("existing");
    expect(second.approvalEvidence?.journalRef).toBe(
      first.approvalEvidence?.journalRef,
    );
    expect(second.approvalEvidence?.event).toEqual(
      first.approvalEvidence?.event,
    );
    await expect(
      operator.decideHumanApproval(human, { status: "denied" }),
    ).rejects.toMatchObject({ code: "APPROVAL_DECISION_CONFLICT" });
  });

  it("defaults to a journaled denial after the approval timeout", async () => {
    const clock = new MutableClock("2026-08-09T08:00:00.000Z");
    const journal = new InMemoryHumanApprovalJournal();
    const { operator, state } = evaluate({
      clock,
      journal,
      inspection: { ...inspectionInput, challenges: ["three_ds"] },
    });
    const human = asHuman(state);

    await expect(operator.expireHumanApproval(human)).rejects.toMatchObject({
      code: "APPROVAL_PENDING",
    });
    clock.set("2026-08-09T08:05:00.000Z");
    const timedOut = await operator.decideHumanApproval(human, {
      status: "approved",
    });

    expect(timedOut.stage).toBe("requiresHuman");
    if (timedOut.stage !== "requiresHuman") {
      throw new Error("expected human terminal state");
    }
    expect(timedOut.terminalDecision?.event.status).toBe("timed_out_denied");
    expect(journal.size).toBe(1);
  });

  it("fails closed when the approval decision cannot be journaled", async () => {
    const appendOnce = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const journal: HumanApprovalJournal = { appendOnce };
    const { operator, state } = evaluate({
      journal,
      quote: { ...quoteInput, irreversibleCommit: true },
    });
    const human = asHuman(state);

    await expect(
      operator.decideHumanApproval(human, { status: "approved" }),
    ).rejects.toMatchObject({ code: "APPROVAL_JOURNAL_REQUIRED" });
    expect(appendOnce).toHaveBeenCalledTimes(1);
  });

  it("rejects a receipt whose amount differs from the submission intent", () => {
    const { operator, state } = evaluate();
    const submission = operator.prepareSubmission(asPolicy(state));

    expect(() =>
      operator.recordReceipt(submission, {
        status: "confirmed",
        authoritative: true,
        amount: { ...usd12, amountAtomic: "1199" },
        evidenceRef: "receipt:local:mismatch",
        observedAt: "2026-08-09T08:00:01.000Z",
      }),
    ).toThrowError(
      expect.objectContaining<Partial<CheckoutContractError>>({
        code: "RECEIPT_MISMATCH",
      }),
    );
  });
});
