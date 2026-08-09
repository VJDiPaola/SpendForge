import "server-only";

import {
  buildRainCardAuditReceipt,
  buildSyntheticAuditReceipt,
  RAIN_CARD_AUDIT_RECEIPT_ID,
  SYNTHETIC_AUDIT_RECEIPT_ID,
} from "@/lib/operations";
import {
  ATLAS_AGENT_DECISION_RECEIPT_ID,
  buildAtlasDecisionReceipt,
} from "@/lib/demo";
import {
  OPENAI_DECISION_PROOF_RECEIPT_ID,
  readOpenAIDecisionProof,
} from "@/lib/decision/proof";
import {
  RAIN_NORTHSTAR_PROOF_RECEIPT_ID,
  readRainNorthstarAttemptReceipt,
} from "@/lib/integrations/rain/northstar-proof";
import {
  MONAD_X402_PROOF_RECEIPT_ID,
  readMonadX402AuditReceipt,
} from "@/lib/integrations/x402/proof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuditReceiptRouteProps = {
  params: Promise<{ receiptId: string }>;
};

const safeHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  _request: Request,
  { params }: AuditReceiptRouteProps,
): Promise<Response> {
  const { receiptId } = await params;
  if (
    receiptId !== SYNTHETIC_AUDIT_RECEIPT_ID &&
    receiptId !== RAIN_CARD_AUDIT_RECEIPT_ID &&
    receiptId !== ATLAS_AGENT_DECISION_RECEIPT_ID &&
    receiptId !== OPENAI_DECISION_PROOF_RECEIPT_ID &&
    receiptId !== RAIN_NORTHSTAR_PROOF_RECEIPT_ID &&
    receiptId !== MONAD_X402_PROOF_RECEIPT_ID
  ) {
    return Response.json(
      { error: "AUDIT_RECEIPT_NOT_FOUND" },
      { status: 404, headers: safeHeaders },
    );
  }

  const isRainCardReceipt = receiptId === RAIN_CARD_AUDIT_RECEIPT_ID;
  const isAgentDecisionReceipt =
    receiptId === ATLAS_AGENT_DECISION_RECEIPT_ID;
  const isLiveOpenAIDecisionReceipt =
    receiptId === OPENAI_DECISION_PROOF_RECEIPT_ID;
  const isRainNorthstarReceipt =
    receiptId === RAIN_NORTHSTAR_PROOF_RECEIPT_ID;
  const isMonadX402Receipt = receiptId === MONAD_X402_PROOF_RECEIPT_ID;
  let receipt;
  if (
    isLiveOpenAIDecisionReceipt ||
    isRainNorthstarReceipt ||
    isMonadX402Receipt
  ) {
    try {
      const dynamicReceipt = isRainNorthstarReceipt
        ? await readRainNorthstarAttemptReceipt()
        : isMonadX402Receipt
          ? await readMonadX402AuditReceipt()
          : (await readOpenAIDecisionProof())?.receipt;
      if (!dynamicReceipt) {
        return Response.json(
          { error: "AUDIT_RECEIPT_NOT_FOUND" },
          { status: 404, headers: safeHeaders },
        );
      }
      receipt = dynamicReceipt;
    } catch {
      return Response.json(
        { error: "AUDIT_RECEIPT_UNAVAILABLE" },
        { status: 503, headers: safeHeaders },
      );
    }
  } else {
    receipt = isRainCardReceipt
      ? buildRainCardAuditReceipt()
      : isAgentDecisionReceipt
        ? await buildAtlasDecisionReceipt()
        : buildSyntheticAuditReceipt();
  }
  return Response.json(receipt, {
    headers: {
      ...safeHeaders,
      "Content-Disposition": isRainCardReceipt
        ? 'attachment; filename="spendforge-rain-card-redacted-capture-20260808-v2.json"'
        : isLiveOpenAIDecisionReceipt
          ? 'attachment; filename="spendforge-atlas-openai-decision-live-v1.json"'
        : isRainNorthstarReceipt
          ? 'attachment; filename="spendforge-rain-northstar-attempt-live-v1.json"'
        : isMonadX402Receipt
          ? 'attachment; filename="spendforge-monad-x402-testnet-v1.json"'
        : isAgentDecisionReceipt
          ? 'attachment; filename="spendforge-atlas-agent-decision-fixture-v1.json"'
          : 'attachment; filename="spendforge-audit-atlas-fixture-v1.json"',
      "X-SpendForge-Evidence-Mode": isRainCardReceipt
        ? "live-sandbox"
        : isRainNorthstarReceipt
          ? "rain-sandbox-attempt"
        : isMonadX402Receipt
          ? "monad-testnet-attempt"
        : isLiveOpenAIDecisionReceipt
          ? "openai-live-proposal"
        : "fixture",
      ...(isRainCardReceipt
        ? { "X-SpendForge-Evidence-Source": "verified-redacted-capture" }
        : isLiveOpenAIDecisionReceipt
          ? { "X-SpendForge-Evidence-Source": "durable-structured-model-proof" }
        : isRainNorthstarReceipt
          ? { "X-SpendForge-Evidence-Source": "durable-redacted-provider-attempt" }
        : isMonadX402Receipt
          ? { "X-SpendForge-Evidence-Source": "durable-redacted-testnet-attempt" }
        : isAgentDecisionReceipt
          ? { "X-SpendForge-Evidence-Source": "deterministic-fixture-proposal" }
          : {}),
    },
  });
}
