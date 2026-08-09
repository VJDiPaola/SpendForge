import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DurableX402AttemptGate,
  SPENDFORGE_X402_RUN_SCOPE,
  x402Fingerprint,
} from "@/lib/integrations/x402";
import type { DurableOperationJournalStore } from "@/lib/operations";
import { MemoryOperationJournalStore } from "../helpers/memory-operation-journal";

function durableStore(): {
  memory: MemoryOperationJournalStore;
  store: DurableOperationJournalStore;
} {
  const memory = new MemoryOperationJournalStore();
  return {
    memory,
    store: {
      durability: "durable",
      read: memory.read.bind(memory),
      append: memory.append.bind(memory),
    },
  };
}

const attemptFingerprint = x402Fingerprint("atlas-x402-attempt-v1");
const recoveryKey = Buffer.alloc(32, 6).toString("base64");
const reservation = {
  attemptFingerprint,
  endpointFingerprint: x402Fingerprint("https://supplier.invalid/resource"),
  amountAtomic: "3000",
  asset: "USDC" as const,
  network: "eip155:10143" as const,
  reservedAt: "2026-08-08T20:00:00.000Z",
};

describe("durable x402 attempt gate", () => {
  it("cannot advertise durable semantics over a memory store", () => {
    expect(
      () => new DurableX402AttemptGate(new MemoryOperationJournalStore(), recoveryKey),
    ).toThrow(/Durable x402 operation journal is required/);
  });

  it("atomically reserves once and records terminal facilitator evidence", async () => {
    const { memory, store } = durableStore();
    const gate = new DurableX402AttemptGate(store, recoveryKey);

    const reservations = await Promise.all([
      gate.reserve(reservation),
      gate.reserve(reservation),
    ]);
    expect(reservations.sort()).toEqual([false, true]);

    await gate.finalize({
      attemptFingerprint,
      state: "settled",
      finalizedAt: "2026-08-08T20:00:01.000Z",
      transactionReference: `0x${"a".repeat(64)}`,
    });

    let journal = await memory.read(SPENDFORGE_X402_RUN_SCOPE);
    expect(journal.map((entry) => entry.state)).toEqual([
      "submitted",
      "provider-pending",
    ]);
    expect(journal.at(-1)).toMatchObject({
      truthBoundary: "testnet-unconfirmed",
      authoritativeReadback: {
        state: "pending",
        providerState: "settlement-pending",
      },
    });
    expect(journal.at(-1)?.recoveryEnvelope?.kind).toBe(
      "monad_transaction_hash",
    );

    await gate.confirmChainReceipt({
      attemptFingerprint,
      transactionReference: `0x${"a".repeat(64)}`,
      confirmedAt: "2026-08-08T20:00:02.000Z",
    });
    journal = await memory.read(SPENDFORGE_X402_RUN_SCOPE);
    expect(journal.at(-1)).toMatchObject({
      state: "provider-confirmed",
      truthBoundary: "testnet-authoritative",
      authoritativeReadback: {
        state: "matched-terminal",
        providerState: "completed",
      },
    });
    expect(JSON.stringify(journal)).not.toContain(`0x${"a".repeat(64)}`);
  });

  it("enforces one run-wide 3000-atomic purchase across distinct attempt IDs", async () => {
    const { store } = durableStore();
    const gate = new DurableX402AttemptGate(store, recoveryKey);
    await expect(gate.reserve(reservation)).resolves.toBe(true);
    await expect(
      gate.reserve({
        ...reservation,
        attemptFingerprint: x402Fingerprint("atlas-x402-attempt-v2"),
        reservedAt: "2026-08-08T20:00:01.000Z",
      }),
    ).resolves.toBe(false);
  });
});
