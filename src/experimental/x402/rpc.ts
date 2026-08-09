import "server-only";

import { z } from "zod";

import {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_RPC_URL,
  MONAD_TESTNET_USDC_ADDRESS,
  SPENDFORGE_X402_PRICE_ATOMIC,
} from "./constants";
import { hexAddressSchema, type HexAddress } from "./contracts";
import { X402AdapterError } from "./errors";

const transactionHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const hexQuantitySchema = z.string().regex(/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/);
const transferTopic =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type RpcFetch = typeof globalThis.fetch;

function normalizedAddress(value: string) {
  return value.toLowerCase();
}

function topicAddress(address: HexAddress) {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function balanceOfData(address: HexAddress) {
  return `0x70a08231${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

async function rpcCall(input: {
  method: string;
  params: readonly unknown[];
  fetchImpl: RpcFetch;
  id: number;
}) {
  let response: Response;
  try {
    response = await input.fetchImpl(MONAD_TESTNET_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: input.id,
        method: input.method,
        params: input.params,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new X402AdapterError("X402_TESTNET_PREFLIGHT_FAILED", "failed");
  }
  const body = await response.json().catch(() => null);
  const parsed = z
    .object({ jsonrpc: z.literal("2.0"), id: z.number(), result: z.unknown() })
    .passthrough()
    .safeParse(body);
  if (!response.ok || !parsed.success || parsed.data.id !== input.id) {
    throw new X402AdapterError("X402_TESTNET_PREFLIGHT_FAILED", "failed");
  }
  return parsed.data.result;
}

export type MonadTestnetPreflight = {
  providerCalls: 4;
  chainIdMatch: boolean;
  usdcContractPresent: boolean;
  buyerHasPaymentAsset: boolean;
  buyerHasNativeGas: boolean;
  buyerUsdcBalanceAtomic: string;
  buyerNativeBalanceWei: string;
  ready: boolean;
};

export async function preflightMonadTestnet(input: {
  buyerAddress: HexAddress;
  sellerAddress: HexAddress;
  fetchImpl?: RpcFetch;
}): Promise<MonadTestnetPreflight> {
  const buyerAddress = hexAddressSchema.parse(input.buyerAddress) as HexAddress;
  const sellerAddress = hexAddressSchema.parse(input.sellerAddress) as HexAddress;
  if (normalizedAddress(buyerAddress) === normalizedAddress(sellerAddress)) {
    throw new X402AdapterError("X402_CONFIGURATION_MISSING", "not_started");
  }
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const [chainId, code, nativeBalance, tokenBalance] = await Promise.all([
    rpcCall({ method: "eth_chainId", params: [], fetchImpl, id: 1 }),
    rpcCall({
      method: "eth_getCode",
      params: [MONAD_TESTNET_USDC_ADDRESS, "latest"],
      fetchImpl,
      id: 2,
    }),
    rpcCall({
      method: "eth_getBalance",
      params: [buyerAddress, "latest"],
      fetchImpl,
      id: 3,
    }),
    rpcCall({
      method: "eth_call",
      params: [
        { to: MONAD_TESTNET_USDC_ADDRESS, data: balanceOfData(buyerAddress) },
        "latest",
      ],
      fetchImpl,
      id: 4,
    }),
  ]);
  const parsedChainId = hexQuantitySchema.safeParse(chainId);
  const parsedCode = z.string().regex(/^0x[0-9a-fA-F]*$/).safeParse(code);
  const parsedNative = hexQuantitySchema.safeParse(nativeBalance);
  const parsedToken = z.string().regex(/^0x[0-9a-fA-F]{1,64}$/).safeParse(tokenBalance);
  if (
    !parsedChainId.success ||
    !parsedCode.success ||
    !parsedNative.success ||
    !parsedToken.success
  ) {
    throw new X402AdapterError("X402_TESTNET_PREFLIGHT_FAILED", "failed");
  }
  const chainIdMatch = BigInt(parsedChainId.data) === BigInt(MONAD_TESTNET_CHAIN_ID);
  const usdcContractPresent = parsedCode.data !== "0x" && parsedCode.data !== "0x0";
  const buyerNativeBalanceWei = BigInt(parsedNative.data).toString();
  const buyerUsdcBalanceAtomic = BigInt(parsedToken.data).toString();
  const buyerHasNativeGas = BigInt(buyerNativeBalanceWei) > BigInt(0);
  const buyerHasPaymentAsset =
    BigInt(buyerUsdcBalanceAtomic) >= BigInt(SPENDFORGE_X402_PRICE_ATOMIC);
  return {
    providerCalls: 4,
    chainIdMatch,
    usdcContractPresent,
    buyerHasPaymentAsset,
    buyerHasNativeGas,
    buyerUsdcBalanceAtomic,
    buyerNativeBalanceWei,
    ready:
      chainIdMatch &&
      usdcContractPresent &&
      buyerHasPaymentAsset &&
      buyerHasNativeGas,
  };
}

const receiptSchema = z
  .object({
    transactionHash: transactionHashSchema,
    status: hexQuantitySchema,
    logs: z.array(
      z
        .object({
          address: hexAddressSchema,
          topics: z.array(z.string().regex(/^0x[0-9a-fA-F]{64}$/)),
          data: z.string().regex(/^0x[0-9a-fA-F]+$/),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export async function readExactMonadPaymentReceipt(input: {
  transactionReference: string;
  buyerAddress: HexAddress;
  sellerAddress: HexAddress;
  fetchImpl?: RpcFetch;
}) {
  const transactionReference = transactionHashSchema.parse(
    input.transactionReference,
  );
  const buyerAddress = hexAddressSchema.parse(input.buyerAddress) as HexAddress;
  const sellerAddress = hexAddressSchema.parse(input.sellerAddress) as HexAddress;
  const result = await rpcCall({
    method: "eth_getTransactionReceipt",
    params: [transactionReference],
    fetchImpl: input.fetchImpl ?? globalThis.fetch,
    id: 5,
  });
  const receipt = receiptSchema.safeParse(result);
  if (!receipt.success) {
    throw new X402AdapterError("X402_CHAIN_RECEIPT_UNCONFIRMED", "unknown");
  }
  const transfer = receipt.data.logs.find(
    (log) =>
      normalizedAddress(log.address) ===
        normalizedAddress(MONAD_TESTNET_USDC_ADDRESS) &&
      log.topics[0]?.toLowerCase() === transferTopic &&
      log.topics[1]?.toLowerCase() === topicAddress(buyerAddress) &&
      log.topics[2]?.toLowerCase() === topicAddress(sellerAddress) &&
      BigInt(log.data) === BigInt(SPENDFORGE_X402_PRICE_ATOMIC),
  );
  const confirmed =
    receipt.data.transactionHash.toLowerCase() ===
      transactionReference.toLowerCase() &&
    BigInt(receipt.data.status) === BigInt(1) &&
    Boolean(transfer);
  if (!confirmed) {
    throw new X402AdapterError("X402_CHAIN_RECEIPT_UNCONFIRMED", "unknown");
  }
  return {
    providerCalls: 1,
    confirmed: true,
    matchCodes: [
      "TRANSACTION_HASH_MATCH",
      "CHAIN_RECEIPT_SUCCESS",
      "TRANSFER_LOG_BUYER_MATCH",
      "TRANSFER_LOG_SELLER_MATCH",
      "TRANSFER_LOG_AMOUNT_3000_MATCH",
    ],
  } as const;
}
