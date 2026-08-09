export const x402AdapterErrorCodes = [
  "X402_CONFIGURATION_MISSING",
  "X402_PREVIEW_ONLY",
  "X402_KILL_SWITCH_CLOSED",
  "X402_ATTEMPT_NOT_AUTHORIZED",
  "X402_DUPLICATE_ATTEMPT",
  "X402_DURABLE_GATE_REQUIRED",
  "X402_JOURNAL_UNAVAILABLE",
  "X402_RESOURCE_NOT_ALLOWED",
  "X402_PAYMENT_REQUIREMENT_REJECTED",
  "X402_PAYMENT_NOT_SETTLED",
  "X402_SETTLEMENT_UNKNOWN",
  "X402_SUPPORTED_SCHEMA_MISMATCH",
  "X402_TESTNET_PREFLIGHT_FAILED",
  "X402_CHAIN_RECEIPT_UNCONFIRMED",
] as const;

export type X402AdapterErrorCode = (typeof x402AdapterErrorCodes)[number];

/**
 * Public-safe x402 boundary error. It deliberately carries no URL, address,
 * provider body, payment header, private key, or original exception message.
 */
export class X402AdapterError extends Error {
  readonly retryable = false;

  constructor(
    readonly code: X402AdapterErrorCode,
    readonly operationState: "not_started" | "failed" | "unknown",
  ) {
    super(code);
    this.name = "X402AdapterError";
  }
}
