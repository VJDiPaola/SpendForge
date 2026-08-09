import { createHmac, timingSafeEqual } from "node:crypto";

import { captureResponseShape, type OperationKind } from "@/lib/operations";

import type { ProofConfig } from "./schemas";

export type ProviderCall = {
  status: number;
  ok: boolean;
  payload: unknown;
  responseShape: ReturnType<typeof captureResponseShape>;
};

export const settlement400Codes = [
  [/already settled/i, "SETTLE_400_ALREADY_SETTLED"],
  [/already closed/i, "SETTLE_400_ALREADY_CLOSED"],
  [/no card associated/i, "SETTLE_400_NO_CARD_ASSOCIATION"],
  [/processor id/i, "SETTLE_400_NO_PROCESSOR_ID"],
] as const;

export function classifySettlement400(payload: unknown): string {
  const message =
    typeof payload === "object" && payload !== null && "message" in payload
      ? (payload as { message?: unknown }).message
      : undefined;
  if (typeof message !== "string") return "SETTLE_400_UNRECOGNIZED";
  return (
    settlement400Codes.find(([pattern]) => pattern.test(message))?.[1] ??
    "SETTLE_400_UNRECOGNIZED"
  );
}

export class RainNorthstarProofError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly providerCalls = 0,
  ) {
    super(code);
    this.name = "RainNorthstarProofError";
  }
}

export function exactValue(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function providerIdempotencyKey(
  operation: OperationKind,
  fingerprint: string,
  encodedRecoveryKey: string,
): string {
  return `sf-${createHmac("sha256", Buffer.from(encodedRecoveryKey, "base64"))
    .update(`${operation}\u001f${fingerprint}`, "utf8")
    .digest("hex")
    .slice(0, 40)}`;
}

export async function providerCall(input: {
  config: Pick<ProofConfig, "RAIN_BASE_URL" | "RAIN_API_KEY">;
  fetchImpl: typeof globalThis.fetch;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  sessionId?: string;
}): Promise<ProviderCall> {
  const headers = new Headers({
    Accept: "application/json",
    "Api-Key": input.config.RAIN_API_KEY,
  });
  if (input.body !== undefined) headers.set("Content-Type", "application/json");
  if (input.idempotencyKey) headers.set("Idempotency-Key", input.idempotencyKey);
  if (input.sessionId) headers.set("sessionid", input.sessionId);

  let response: Response;
  try {
    response = await input.fetchImpl(`${input.config.RAIN_BASE_URL}${input.path}`, {
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new RainNorthstarProofError("RAIN_PROVIDER_OUTCOME_AMBIGUOUS", 502, 1);
  }
  const payload = await response.json().catch(() => null);
  return {
    status: response.status,
    ok: response.ok,
    payload,
    responseShape: captureResponseShape(payload),
  };
}
