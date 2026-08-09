import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  confirmMonadSellerSettlementDelivery,
  DurableX402AttemptGate,
  PULSE_RESOURCE_CONTENT_HASH,
  readMonadX402AuditReceipt,
  recordMonadSellerSettlementDelivery,
  SPENDFORGE_X402_RUN_SCOPE,
  x402Fingerprint,
} from "@/experimental/x402";
import type { DurableOperationJournalStore } from "@/lib/operations";
import { MemoryOperationJournalStore } from "../helpers/memory-operation-journal";

const recoveryKey = Buffer.alloc(32, 5).toString("base64");
const attemptFingerprint = x402Fingerprint("atlas-monad-proof-v1");
const transaction = `0x${"a".repeat(64)}`;

function durableStore() {
  const memory = new MemoryOperationJournalStore();
  const store: DurableOperationJournalStore = {
    durability: "durable",
    read: memory.read.bind(memory),
    append: memory.append.bind(memory),
  };
  return { memory, store };
}

describe("causal x402 payment and seller delivery evidence", () => {
  it("keeps facilitator settlement pending until exact chain confirmation", async () => {
    const { memory, store } = durableStore();
    const gate = new DurableX402AttemptGate(store, recoveryKey);
    await expect(
      gate.reserve({
        attemptFingerprint,
        endpointFingerprint: x402Fingerprint("https://preview.invalid/api/resources/pulse"),
        amountAtomic: "3000",
        asset: "USDC",
        network: "eip155:10143",
        reservedAt: "2026-08-09T13:00:00.000Z",
      }),
    ).resolves.toBe(true);

    await recordMonadSellerSettlementDelivery({
      store,
      attemptFingerprint,
      transactionReference: transaction,
      deliveryContentHash: PULSE_RESOURCE_CONTENT_HASH,
      encodedRecoveryKey: recoveryKey,
      observedAt: "2026-08-09T13:00:01.000Z",
    });
    await gate.finalize({
      attemptFingerprint,
      state: "settled",
      finalizedAt: "2026-08-09T13:00:02.000Z",
      transactionReference: transaction,
    });
    let journal = await memory.read(SPENDFORGE_X402_RUN_SCOPE);
    expect(
      journal.filter((entry) => entry.state === "provider-confirmed"),
    ).toHaveLength(0);

    await gate.confirmChainReceipt({
      attemptFingerprint,
      transactionReference: transaction,
      confirmedAt: "2026-08-09T13:00:03.000Z",
    });
    await confirmMonadSellerSettlementDelivery({
      store,
      attemptFingerprint,
      transactionReference: transaction,
      encodedRecoveryKey: recoveryKey,
      confirmedAt: "2026-08-09T13:00:04.000Z",
    });
    journal = await memory.read(SPENDFORGE_X402_RUN_SCOPE);
    expect(
      journal.filter((entry) => entry.state === "provider-confirmed"),
    ).toHaveLength(2);

    const receipt = await readMonadX402AuditReceipt({}, store);
    expect(receipt).toMatchObject({
      truthBoundary: "testnet-authoritative",
      synthetic: false,
      summary: {
        operationCount: 2,
        mutationCount: 1,
        authoritativeTerminalCount: 2,
      },
    });
    expect(receipt?.operations.at(-1)).toMatchObject({
      deliveryContentHash: PULSE_RESOURCE_CONTENT_HASH,
    });
    expect(JSON.stringify(receipt)).not.toContain(transaction);
    expect(JSON.stringify(receipt)).not.toContain("recoveryEnvelope");
  });
});
