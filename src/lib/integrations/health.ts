import "server-only";

import { inspectServerEnvironment } from "@/lib/env";
import type { IntegrationName } from "@/lib/integrations/types";

export const healthCodeValues = [
  "FIXTURE_MODE",
  "REPLAY_MODE",
  "ENVIRONMENT_INVALID",
  "CONFIGURATION_MISSING",
  "MUTATION_GATES_CLOSED",
  "MODEL_EXECUTION_GATE_CLOSED",
  "PROVIDER_PROOF_UNCONFIRMED",
] as const;

export type HealthCode = (typeof healthCodeValues)[number];

export type IntegrationHealth = {
  ok: boolean;
  mode: "fixture" | "live" | "replay" | "invalid";
  configured: {
    rain: boolean;
    monadX402: boolean;
    database: boolean;
    decisionModel: boolean;
    decisionProof: boolean;
    openaiApiKey: boolean;
    openaiProvider: boolean;
    recoveryEncryption: boolean;
    rainProofAttempt: boolean;
    rainReconciliationAttempt: boolean;
  };
  gates: {
    rainProvider: boolean;
    rainFunding: boolean;
    rainCardIssuance: boolean;
    monadPayment: boolean;
    monadSeller: boolean;
    openaiDecision: boolean;
    openaiProofWindow: boolean;
    rainAuthorization: boolean;
    rainSettlement: boolean;
    rainNorthstarWindow: boolean;
    rainReconciliationWindow: boolean;
  };
  missingIntegrations: IntegrationName[];
  codes: HealthCode[];
};

/**
 * This is a configuration-only health check. It never calls a provider and it
 * cannot prove provider reachability, Rain settlement, or x402 support.
 */
export function getIntegrationHealth(
  source: Record<string, string | undefined> = process.env,
): IntegrationHealth {
  const environment = inspectServerEnvironment(source);

  if (!environment.valid || environment.mode === "invalid") {
    return {
      ok: false,
      mode: environment.mode,
      configured: environment.configured,
      gates: environment.gates,
      missingIntegrations: [
        "rain",
        "monad_x402",
        "database",
        "decision_model",
      ],
      codes: ["ENVIRONMENT_INVALID"],
    };
  }

  if (environment.mode === "fixture") {
    return {
      ok: true,
      mode: "fixture",
      configured: environment.configured,
      gates: environment.gates,
      missingIntegrations: [],
      codes: ["FIXTURE_MODE"],
    };
  }

  if (environment.mode === "replay") {
    return {
      ok: true,
      mode: "replay",
      configured: environment.configured,
      gates: environment.gates,
      missingIntegrations: [],
      codes: ["REPLAY_MODE"],
    };
  }

  const missingIntegrations: IntegrationName[] = [];
  const codes: HealthCode[] = [];

  if (!environment.configured.rain) {
    missingIntegrations.push("rain");
  }
  if (!environment.configured.monadX402) {
    missingIntegrations.push("monad_x402");
  }
  if (!environment.configured.database) {
    missingIntegrations.push("database");
  }
  if (!environment.configured.decisionModel) {
    missingIntegrations.push("decision_model");
  }
  if (missingIntegrations.length > 0) {
    codes.push("CONFIGURATION_MISSING");
  }

  if (
    !environment.gates.rainProvider ||
    !environment.gates.rainFunding ||
    !environment.gates.rainCardIssuance ||
    !environment.gates.rainAuthorization ||
    !environment.gates.rainSettlement ||
    !environment.gates.monadPayment ||
    !environment.gates.monadSeller
  ) {
    codes.push("MUTATION_GATES_CLOSED");
  }
  if (!environment.gates.openaiDecision) {
    codes.push("MODEL_EXECUTION_GATE_CLOSED");
  }
  codes.push("PROVIDER_PROOF_UNCONFIRMED");

  return {
    ok: false,
    mode: "live",
    configured: environment.configured,
    gates: environment.gates,
    missingIntegrations,
    codes,
  };
}
