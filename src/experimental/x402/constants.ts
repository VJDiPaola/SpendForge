export const MONAD_TESTNET_NETWORK = "eip155:10143" as const;
export const MONAD_TESTNET_CHAIN_ID = 10_143 as const;
export const MONAD_TESTNET_USDC_ADDRESS =
  "0x534b2f3A21130d7a60830c2Df862319e593943A3" as const;
export const MONAD_X402_FACILITATOR_URL =
  "https://x402-facilitator.molandak.org" as const;
export const MONAD_TESTNET_RPC_URL = "https://testnet-rpc.monad.xyz" as const;
export const MONAD_TESTNET_EXPLORER_TRANSACTION_URL =
  "https://testnet.monadvision.com/tx/" as const;

export const SPENDFORGE_X402_SCHEME = "exact" as const;
export const SPENDFORGE_X402_VERSION = 2 as const;
export const SPENDFORGE_X402_USDC_DECIMALS = 6 as const;
export const SPENDFORGE_X402_PRICE_ATOMIC = "3000" as const;
export const SPENDFORGE_X402_ATTEMPT_HEADER =
  "x-spendforge-attempt-id" as const;
export const SPENDFORGE_X402_RUN_SCOPE =
  "sha256:32bbd6e6f7f624944211ac8b28a1673979eb7888fb586d37030aac7f2237c907" as const;

export const X402_PACKAGE_VERSIONS = {
  core: "2.21.0",
  evm: "2.21.0",
  fetch: "2.21.0",
  next: "2.21.0",
} as const;
