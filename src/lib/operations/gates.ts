import { z } from "zod";

import {
  fingerprintSchema,
  mutationOperationKindSchema,
  operationModeSchema,
  operationProviderSchema,
  publicOperationRefSchema,
  safeMoneySchema,
  type OperationJournalEntry,
} from "./schemas";

export const operationGuardCodeSchema = z.enum([
  "GUARD_ALLOWED",
  "KILL_SWITCH_CLOSED",
  "FIXTURE_MUTATION_FORBIDDEN",
  "PROVIDER_MISMATCH",
  "MODE_MISMATCH",
  "OPERATION_NOT_ALLOWED",
  "MUTATION_CAP_REACHED",
  "ONE_ATTEMPT_REQUIRED",
  "DUPLICATE_OPERATION",
  "SPEND_CAP_MISMATCH",
  "SPEND_CAP_EXCEEDED",
  "CUMULATIVE_SPEND_CAP_EXCEEDED",
]);
export type OperationGuardCode = z.infer<typeof operationGuardCodeSchema>;

export const providerOperationGuardSchema = z
  .object({
    provider: operationProviderSchema,
    mode: operationModeSchema,
    mutationEnabled: z.boolean(),
    allowedOperation: mutationOperationKindSchema,
    maxMutations: z.number().int().positive().max(20),
    oneAttemptOnly: z.literal(true),
    spendCap: safeMoneySchema.optional(),
    cumulativeSpendCap: safeMoneySchema.optional(),
  })
  .strict();
export type ProviderOperationGuard = z.infer<
  typeof providerOperationGuardSchema
>;

export const operationGateRequestSchema = z
  .object({
    operationRef: publicOperationRefSchema,
    provider: operationProviderSchema,
    mode: operationModeSchema,
    operation: mutationOperationKindSchema,
    attempt: z.number().int().positive().max(1_000_000),
    idempotencyFingerprint: fingerprintSchema,
    amount: safeMoneySchema.optional(),
  })
  .strict();
export type OperationGateRequest = z.infer<typeof operationGateRequestSchema>;

export type OperationGateDecision = {
  allowed: boolean;
  codes: OperationGuardCode[];
  duplicateOperationRef?: string;
};

const executionStates = new Set<OperationJournalEntry["state"]>([
  "submitted",
  "provider-accepted",
  "provider-pending",
  "readback-pending",
  "provider-confirmed",
  "provider-declined",
  "provider-failed",
  "ambiguous",
  "closed",
]);

const spendInitiatingOperations = new Set<OperationGateRequest["operation"]>([
  "rain.authorize_transaction",
  "monad_x402.pay_resource",
]);

function providerForOperation(operation: OperationGateRequest["operation"]) {
  if (operation.startsWith("rain.")) return "rain";
  if (operation.startsWith("monad_x402.")) return "monad_x402";
  return "openai";
}

function expectedMode(provider: OperationGateRequest["provider"]) {
  if (provider === "rain") return "live-sandbox";
  if (provider === "monad_x402") return "testnet";
  return "live-model";
}

function sameMoneyUnit(
  left: NonNullable<OperationGateRequest["amount"]>,
  right: NonNullable<ProviderOperationGuard["spendCap"]>,
) {
  return (
    left.asset === right.asset &&
    left.decimals === right.decimals &&
    left.network === right.network
  );
}

export function evaluateOperationGate(input: {
  config: ProviderOperationGuard;
  request: OperationGateRequest;
  journal: readonly OperationJournalEntry[];
}): OperationGateDecision {
  const config = providerOperationGuardSchema.parse(input.config);
  const request = operationGateRequestSchema.parse(input.request);
  const codes: OperationGuardCode[] = [];

  if (!config.mutationEnabled) codes.push("KILL_SWITCH_CLOSED");
  if (request.mode === "fixture" || config.mode === "fixture") {
    codes.push("FIXTURE_MUTATION_FORBIDDEN");
  }
  if (
    request.provider !== config.provider ||
    providerForOperation(request.operation) !== request.provider
  ) {
    codes.push("PROVIDER_MISMATCH");
  }
  if (
    request.mode !== config.mode ||
    request.mode !== expectedMode(request.provider)
  ) {
    codes.push("MODE_MISMATCH");
  }
  if (request.operation !== config.allowedOperation) {
    codes.push("OPERATION_NOT_ALLOWED");
  }
  if (config.oneAttemptOnly && request.attempt !== 1) {
    codes.push("ONE_ATTEMPT_REQUIRED");
  }

  const executedOperations = new Set(
    input.journal
      .filter((entry) => entry.mutation && executionStates.has(entry.state))
      .map((entry) => entry.operationRef),
  );
  if (executedOperations.size >= config.maxMutations) {
    codes.push("MUTATION_CAP_REACHED");
  }

  const duplicate = input.journal.find(
    (entry) =>
      entry.idempotencyFingerprint === request.idempotencyFingerprint &&
      executionStates.has(entry.state),
  );
  if (duplicate) codes.push("DUPLICATE_OPERATION");

  if (request.provider === "openai" || config.provider === "openai") {
    if (request.amount || config.spendCap) codes.push("SPEND_CAP_MISMATCH");
  } else if (!request.amount || !config.spendCap) {
    codes.push("SPEND_CAP_MISMATCH");
  } else if (!sameMoneyUnit(request.amount, config.spendCap)) {
    codes.push("SPEND_CAP_MISMATCH");
  } else if (BigInt(request.amount.amount) > BigInt(config.spendCap.amount)) {
    codes.push("SPEND_CAP_EXCEEDED");
  }

  if (
    spendInitiatingOperations.has(request.operation) &&
    config.cumulativeSpendCap
  ) {
    if (!request.amount || !sameMoneyUnit(request.amount, config.cumulativeSpendCap)) {
      codes.push("SPEND_CAP_MISMATCH");
    } else {
      const reservedByOperation = new Map<string, bigint>();
      for (const entry of input.journal) {
        if (
          entry.amount &&
          spendInitiatingOperations.has(entry.operation as OperationGateRequest["operation"]) &&
          executionStates.has(entry.state) &&
          entry.amount.asset === request.amount.asset &&
          entry.amount.decimals === request.amount.decimals &&
          entry.amount.network === request.amount.network
        ) {
          reservedByOperation.set(entry.operationRef, BigInt(entry.amount.amount));
        }
      }
      const reserved = [...reservedByOperation.values()].reduce(
        (total, amount) => total + amount,
        BigInt(0),
      );
      if (
        reserved + BigInt(request.amount.amount) >
        BigInt(config.cumulativeSpendCap.amount)
      ) {
        codes.push("CUMULATIVE_SPEND_CAP_EXCEEDED");
      }
    }
  }

  const uniqueCodes = [...new Set(codes)];
  if (uniqueCodes.length === 0) {
    return { allowed: true, codes: ["GUARD_ALLOWED"] };
  }

  return {
    allowed: false,
    codes: uniqueCodes,
    ...(duplicate ? { duplicateOperationRef: duplicate.operationRef } : {}),
  };
}
