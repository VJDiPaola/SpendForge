import "server-only";

import { z } from "zod";

import {
  RAIN_SANDBOX_BASE_URL,
  rainSandboxBaseUrlSchema,
} from "@/lib/integrations/rain/base-url";
import { databaseUrlSchema } from "@/lib/operations/database-url";

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().url().optional(),
);

const optionalDatabaseUrl = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  databaseUrlSchema.optional(),
);

const optionalHexAddress = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
);

const optionalPrivateKey = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
);

const disabledByDefaultFlag = z.preprocess((value) => {
  if (value === undefined || value === "") return false;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
}, z.boolean());

export const appModeSchema = z.enum(["fixture", "live", "replay"]);
export type AppMode = z.infer<typeof appModeSchema>;

export const serverEnvSchema = z.object({
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: optionalDatabaseUrl,
  DEMO_MODE: appModeSchema.default("fixture"),
  MODEL_PROVIDER: optionalString,
  OPENAI_API_KEY: optionalString,
  OPENAI_DECISION_MODEL: z.string().trim().min(1).default("gpt-5.6-terra"),
  OPENAI_DECISION_ENABLED: disabledByDefaultFlag,
  OPENAI_DECISION_PROOF_WINDOW_OPEN: disabledByDefaultFlag,
  OPENAI_DECISION_AUTHORIZED_ATTEMPT_ID: optionalString,
  RECOVERY_ENCRYPTION_KEY: optionalString,
  VERCEL_AUTOMATION_BYPASS_SECRET: optionalString,

  RAIN_BASE_URL: rainSandboxBaseUrlSchema.default(RAIN_SANDBOX_BASE_URL),
  RAIN_API_KEY: optionalString,
  RAIN_USER_ID: optionalString,
  RAIN_TEAM_ID: optionalString,
  RAIN_CONTRACT_ID: optionalString,
  RAIN_MUTATIONS_ENABLED: disabledByDefaultFlag,
  RAIN_FUNDING_ENABLED: disabledByDefaultFlag,
  RAIN_CARD_ISSUANCE_ENABLED: disabledByDefaultFlag,
  RAIN_AUTHORIZATION_ENABLED: disabledByDefaultFlag,
  RAIN_SETTLEMENT_ENABLED: disabledByDefaultFlag,
  RAIN_NORTHSTAR_PROOF_WINDOW_OPEN: disabledByDefaultFlag,
  RAIN_NORTHSTAR_AUTHORIZED_ATTEMPT_ID: optionalString,
  RAIN_NORTHSTAR_RECONCILIATION_WINDOW_OPEN: disabledByDefaultFlag,
  RAIN_NORTHSTAR_RECONCILIATION_ATTEMPT_ID: optionalString,

  MONAD_CHAIN_ID: z.coerce.number().int().positive().default(10143),
  MONAD_NETWORK: z.string().default("eip155:10143"),
  MONAD_RPC_URL: z
    .string()
    .url()
    .default("https://testnet-rpc.monad.xyz"),
  MONAD_USDC_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .default("0x534b2f3A21130d7a60830c2Df862319e593943A3"),
  MONAD_FACILITATOR_URL: z
    .string()
    .url()
    .default("https://x402-facilitator.molandak.org"),
  MONAD_X402_PAYMENT_ENABLED: disabledByDefaultFlag,
  MONAD_X402_SELLER_ENABLED: disabledByDefaultFlag,
  MONAD_X402_RESOURCE_URL: optionalUrl,
  MONAD_X402_SELLER_ADDRESS: optionalHexAddress,
  MONAD_X402_AUTHORIZED_ATTEMPT_ID: optionalString,
  MONAD_X402_MAX_AMOUNT_ATOMIC: optionalString,
  MONAD_X402_BUYER_PRIVATE_KEY: optionalPrivateKey,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  return serverEnvSchema.parse(source);
}
export type SafeEnvironmentInspection = {
  valid: boolean;
  mode: AppMode | "invalid";
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
};

/**
 * Returns presence booleans only. It intentionally discards validation issues,
 * because Zod issue metadata can contain secret-shaped input values.
 */
export function inspectServerEnvironment(
  source: Record<string, string | undefined> = process.env,
): SafeEnvironmentInspection {
  const result = serverEnvSchema.safeParse(source);

  if (!result.success) {
    const modeResult = appModeSchema.safeParse(source.DEMO_MODE ?? "fixture");
    return {
      valid: false,
      mode: modeResult.success ? modeResult.data : "invalid",
      configured: {
        rain: false,
        monadX402: false,
        database: false,
        decisionModel: false,
        decisionProof: false,
        openaiApiKey: false,
        openaiProvider: false,
        recoveryEncryption: false,
        rainProofAttempt: false,
        rainReconciliationAttempt: false,
      },
      gates: {
        rainProvider: false,
        rainFunding: false,
        rainCardIssuance: false,
        monadPayment: false,
        monadSeller: false,
        openaiDecision: false,
        openaiProofWindow: false,
        rainAuthorization: false,
        rainSettlement: false,
        rainNorthstarWindow: false,
        rainReconciliationWindow: false,
      },
    };
  }

  const env = result.data;
  return {
    valid: true,
    mode: env.DEMO_MODE,
    configured: {
      rain: Boolean(
        env.RAIN_API_KEY &&
          env.RAIN_USER_ID &&
          env.RAIN_CONTRACT_ID,
      ),
      monadX402: Boolean(
        env.MONAD_X402_BUYER_PRIVATE_KEY &&
          env.MONAD_X402_SELLER_ADDRESS &&
          env.MONAD_X402_RESOURCE_URL &&
          env.MONAD_X402_AUTHORIZED_ATTEMPT_ID &&
          env.MONAD_X402_MAX_AMOUNT_ATOMIC &&
          env.RECOVERY_ENCRYPTION_KEY &&
          env.VERCEL_AUTOMATION_BYPASS_SECRET &&
          env.DATABASE_URL,
      ),
      database: Boolean(env.DATABASE_URL),
      decisionModel: Boolean(
        env.MODEL_PROVIDER === "openai" &&
          env.OPENAI_API_KEY &&
          env.OPENAI_DECISION_MODEL,
      ),
      decisionProof: Boolean(env.OPENAI_DECISION_AUTHORIZED_ATTEMPT_ID),
      openaiApiKey: Boolean(env.OPENAI_API_KEY),
      openaiProvider: env.MODEL_PROVIDER === "openai",
      recoveryEncryption: Boolean(env.RECOVERY_ENCRYPTION_KEY),
      rainProofAttempt: Boolean(env.RAIN_NORTHSTAR_AUTHORIZED_ATTEMPT_ID),
      rainReconciliationAttempt: Boolean(
        env.RAIN_NORTHSTAR_RECONCILIATION_ATTEMPT_ID,
      ),
    },
    gates: {
      rainProvider: env.RAIN_MUTATIONS_ENABLED,
      rainFunding: env.RAIN_FUNDING_ENABLED,
      rainCardIssuance: env.RAIN_CARD_ISSUANCE_ENABLED,
      monadPayment: env.MONAD_X402_PAYMENT_ENABLED,
      monadSeller: env.MONAD_X402_SELLER_ENABLED,
      openaiDecision: env.OPENAI_DECISION_ENABLED,
      openaiProofWindow: env.OPENAI_DECISION_PROOF_WINDOW_OPEN,
      rainAuthorization: env.RAIN_AUTHORIZATION_ENABLED,
      rainSettlement: env.RAIN_SETTLEMENT_ENABLED,
      rainNorthstarWindow: env.RAIN_NORTHSTAR_PROOF_WINDOW_OPEN,
      rainReconciliationWindow:
        env.RAIN_NORTHSTAR_RECONCILIATION_WINDOW_OPEN,
    },
  };
}
