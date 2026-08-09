import { createHash } from "node:crypto";

export type X402AttemptState =
  | "reserved"
  | "settled"
  | "failed"
  | "unknown";

export type X402AttemptReservation = {
  attemptFingerprint: string;
  endpointFingerprint: string;
  amountAtomic: string;
  asset: "USDC";
  network: "eip155:10143";
  reservedAt: string;
};

export type X402AttemptFinalization = {
  attemptFingerprint: string;
  state: Exclude<X402AttemptState, "reserved">;
  finalizedAt: string;
  transactionReference?: string;
};

export interface X402AttemptGate {
  readonly durability: "memory" | "durable";
  reserve(input: X402AttemptReservation): Promise<boolean>;
  finalize(input: X402AttemptFinalization): Promise<void>;
}

export function x402Fingerprint(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

/** Bounded public evidence only; never use as the durable duplicate key. */
export function x402EvidenceFingerprint(value: string): string {
  return x402Fingerprint(value).slice(0, 31);
}

/**
 * Test/fixture gate only. Live Preview construction rejects this implementation
 * because Vercel request memory is not a durable duplicate barrier.
 */
export class MemoryX402AttemptGate implements X402AttemptGate {
  readonly durability = "memory" as const;
  private readonly attempts = new Map<
    string,
    X402AttemptReservation & {
      state: X402AttemptState;
      finalizedAt?: string;
      transactionReference?: string;
    }
  >();

  async reserve(input: X402AttemptReservation): Promise<boolean> {
    if (this.attempts.has(input.attemptFingerprint)) {
      return false;
    }
    this.attempts.set(input.attemptFingerprint, {
      ...input,
      state: "reserved",
    });
    return true;
  }

  async finalize(input: X402AttemptFinalization): Promise<void> {
    const existing = this.attempts.get(input.attemptFingerprint);
    if (!existing) {
      return;
    }
    this.attempts.set(input.attemptFingerprint, {
      ...existing,
      state: input.state,
      finalizedAt: input.finalizedAt,
      transactionReference: input.transactionReference,
    });
  }

  read(attemptFingerprint: string) {
    return this.attempts.get(attemptFingerprint);
  }
}
