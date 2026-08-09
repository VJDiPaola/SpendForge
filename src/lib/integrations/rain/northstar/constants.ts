import {
  deriveEvidenceFingerprint,
  type OperationKind,
  type PublicOperationRef,
  type SafeEndpoint,
  type SafeMoney,
} from "@/lib/operations";

export const RAIN_NORTHSTAR_PROOF_RECEIPT_ID =
  "audit_rain_northstar_spend_live_v1";
export const configuredAttemptContext = () =>
  process.env.RAIN_NORTHSTAR_AUTHORIZED_ATTEMPT_ID?.trim() || "fixture";

export const RAIN_NORTHSTAR_RUN_SCOPE = deriveEvidenceFingerprint(
  `spendforge:atlas:rain-northstar-proof:v1:${configuredAttemptContext()}`,
);

export const cardOperationRef = "op_rain_northstar_card_v1";
export const authorizeOperationRef = "op_rain_northstar_authorize_v1";
export const settleOperationRef = "op_rain_northstar_settle_v1";
export const resumeReadOperationRef = "op_rain_northstar_resume_read_v3";
export const merchantName = "Northstar Synthetic";
export const merchantCategoryCode = "5734";
export const purchaseAmount: SafeMoney = {
  amount: "12",
  decimals: 2,
  asset: "USD",
  network: "rain-sandbox",
};
export const cardLimitAmount: SafeMoney = {
  amount: "12",
  decimals: 2,
  asset: "USDC",
  network: "rain-sandbox",
};

export const operationMetadata: Readonly<
  Record<
    "card" | "authorize" | "settle",
    {
      operationRef: PublicOperationRef;
      operation: OperationKind;
      endpoint: SafeEndpoint;
      amount: SafeMoney;
      offerRef: string;
    }
  >
> = {
  card: {
    operationRef: cardOperationRef,
    operation: "rain.issue_scoped_card",
    endpoint: "/issuing/users/{userId}/cards/scoped",
    amount: cardLimitAmount,
    offerRef: "northstar_scoped_card",
  },
  authorize: {
    operationRef: authorizeOperationRef,
    operation: "rain.authorize_transaction",
    endpoint: "/simulate/transactions/authorize",
    amount: purchaseAmount,
    offerRef: "offer_northstar_background_v1",
  },
  settle: {
    operationRef: settleOperationRef,
    operation: "rain.settle_transaction",
    endpoint: "/simulate/transactions/{transactionId}/settle",
    amount: purchaseAmount,
    offerRef: "offer_northstar_background_v1_settlement",
  },
};

export const resumeReadMetadata = {
  operationRef: resumeReadOperationRef as PublicOperationRef,
  operation: "rain.read_transaction" as const,
  endpoint: "/issuing/transactions/{transactionId}" as SafeEndpoint,
  amount: purchaseAmount,
};
