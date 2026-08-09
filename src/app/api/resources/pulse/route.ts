import { NextResponse, type NextRequest } from "next/server";

import {
  createMonadX402SellerAdapter,
  PULSE_RESOURCE_CONTENT_HASH,
  PULSE_RESOURCE_MANIFEST,
  recordMonadSellerSettlementDelivery,
  x402Fingerprint,
  X402AdapterError,
} from "@/lib/integrations/x402";
import { createRuntimeOperationJournalStore } from "@/lib/operations/postgres-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const attemptId = process.env.MONAD_X402_AUTHORIZED_ATTEMPT_ID;
    const recoveryKey = process.env.RECOVERY_ENCRYPTION_KEY;
    if (!attemptId || !recoveryKey) {
      return NextResponse.json(
        { code: "X402_RESOURCE_UNAVAILABLE" },
        { status: 503 },
      );
    }
    const store = createRuntimeOperationJournalStore(process.env);
    const seller = createMonadX402SellerAdapter({
      onSettledDelivery: async (evidence) => {
        await recordMonadSellerSettlementDelivery({
          store,
          attemptFingerprint: x402Fingerprint(attemptId),
          transactionReference: evidence.transactionReference,
          deliveryContentHash: PULSE_RESOURCE_CONTENT_HASH,
          encodedRecoveryKey: recoveryKey,
          observedAt: evidence.observedAt,
        });
      },
    });
    const handler = seller.protect(async () =>
      NextResponse.json(PULSE_RESOURCE_MANIFEST, {
        headers: {
          "cache-control": "private, no-store, max-age=0",
          "x-content-type-options": "nosniff",
        },
      }),
    );
    return handler(request);
  } catch (error) {
    const code =
      error instanceof X402AdapterError
        ? error.code
        : "X402_RESOURCE_UNAVAILABLE";
    return NextResponse.json({ code }, { status: 503 });
  }
}
