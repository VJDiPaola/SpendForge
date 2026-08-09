import "server-only";

import { z } from "zod";

import { idempotencyKeySchema, integerAmountSchema } from "@/lib/integrations/types";
import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_NETWORK,
  MONAD_TESTNET_RPC_URL,
  MONAD_TESTNET_USDC_ADDRESS,
  MONAD_X402_FACILITATOR_URL,
  SPENDFORGE_X402_PRICE_ATOMIC,
} from "@/experimental/x402/constants";
import { hexAddressSchema, type HexAddress } from "@/experimental/x402/contracts";
import { X402AdapterError } from "@/experimental/x402/errors";

const enabledSchema = z.literal("true");
const privateKeySchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export type MonadX402SafetyConfig = {
  previewOnly: true;
  liveMode: true;
  paymentEnabled: true;
  sellerEnabled: true;
  durableJournalConfigured: true;
  recoveryEncryptionConfigured: true;
  allowedResourceUrl: string;
  sellerAddress: HexAddress;
  authorizedAttemptId: string;
  maxAmountAtomic: string;
  network: typeof MONAD_TESTNET_NETWORK;
};

export type MonadX402EnvironmentConfig = MonadX402SafetyConfig & {
  buyerPrivateKey: `0x${string}`;
  recoveryEncryptionKey: string;
  protectionBypassSecret: string;
  rpcUrl: typeof MONAD_TESTNET_RPC_URL;
};

function parseBoundedAmount(value: string | undefined): string {
  const amount = integerAmountSchema.safeParse(value);
  if (
    !amount.success ||
    BigInt(amount.data) < BigInt(1) ||
    BigInt(amount.data) > BigInt(SPENDFORGE_X402_PRICE_ATOMIC)
  ) {
    throw new X402AdapterError("X402_CONFIGURATION_MISSING", "not_started");
  }
  return amount.data;
}

export function readMonadX402SellerEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): MonadX402SafetyConfig {
  if (environment.VERCEL_ENV !== "preview") {
    throw new X402AdapterError("X402_PREVIEW_ONLY", "not_started");
  }
  if (environment.DEMO_MODE !== "live") {
    throw new X402AdapterError("X402_CONFIGURATION_MISSING", "not_started");
  }
  if (!enabledSchema.safeParse(environment.MONAD_X402_PAYMENT_ENABLED).success) {
    throw new X402AdapterError("X402_KILL_SWITCH_CLOSED", "not_started");
  }
  if (!enabledSchema.safeParse(environment.MONAD_X402_SELLER_ENABLED).success) {
    throw new X402AdapterError("X402_KILL_SWITCH_CLOSED", "not_started");
  }

  const resourceUrl = z.string().url().safeParse(environment.MONAD_X402_RESOURCE_URL);
  const sellerAddress = hexAddressSchema.safeParse(
    environment.MONAD_X402_SELLER_ADDRESS,
  );
  const attemptId = idempotencyKeySchema.safeParse(
    environment.MONAD_X402_AUTHORIZED_ATTEMPT_ID,
  );
  const recoveryKey = z.string().trim().min(1).safeParse(
    environment.RECOVERY_ENCRYPTION_KEY,
  );
  const exactConstants =
    environment.MONAD_CHAIN_ID === String(MONAD_TESTNET_CHAIN_ID) &&
    environment.MONAD_NETWORK === MONAD_TESTNET_NETWORK &&
    environment.MONAD_RPC_URL === MONAD_TESTNET_RPC_URL &&
    environment.MONAD_USDC_ADDRESS?.toLowerCase() ===
      MONAD_TESTNET_USDC_ADDRESS.toLowerCase() &&
    environment.MONAD_FACILITATOR_URL === MONAD_X402_FACILITATOR_URL;
  if (
    !resourceUrl.success ||
    !sellerAddress.success ||
    !attemptId.success ||
    !recoveryKey.success ||
    !environment.DATABASE_URL?.trim() ||
    !exactConstants
  ) {
    throw new X402AdapterError("X402_CONFIGURATION_MISSING", "not_started");
  }

  return {
    previewOnly: true,
    liveMode: true,
    paymentEnabled: true,
    sellerEnabled: true,
    durableJournalConfigured: true,
    recoveryEncryptionConfigured: true,
    allowedResourceUrl: resourceUrl.data,
    sellerAddress: sellerAddress.data as HexAddress,
    authorizedAttemptId: attemptId.data,
    maxAmountAtomic: parseBoundedAmount(
      environment.MONAD_X402_MAX_AMOUNT_ATOMIC,
    ),
    network: MONAD_TESTNET_NETWORK,
  };
}

export function readMonadX402Environment(
  environment: NodeJS.ProcessEnv = process.env,
): MonadX402EnvironmentConfig {
  const safety = readMonadX402SellerEnvironment(environment);
  const privateKey = privateKeySchema.safeParse(
    environment.MONAD_X402_BUYER_PRIVATE_KEY,
  );
  const protectionBypass = z.string().trim().min(16).safeParse(
    environment.VERCEL_AUTOMATION_BYPASS_SECRET,
  );
  if (!privateKey.success || !protectionBypass.success) {
    throw new X402AdapterError("X402_CONFIGURATION_MISSING", "not_started");
  }
  return {
    ...safety,
    buyerPrivateKey: privateKey.data as `0x${string}`,
    recoveryEncryptionKey: environment.RECOVERY_ENCRYPTION_KEY!,
    protectionBypassSecret: protectionBypass.data,
    rpcUrl: MONAD_TESTNET_RPC_URL,
  };
}

export function createProtectedPreviewFetch(
  protectionBypassSecret: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  const secret = z.string().trim().min(16).parse(protectionBypassSecret);
  return async (input, init) => {
    const headers = new Headers(
      input instanceof Request ? input.headers : init?.headers,
    );
    headers.set("x-vercel-protection-bypass", secret);
    return fetchImpl(input, {
      ...init,
      headers,
      redirect: "error",
    });
  };
}
