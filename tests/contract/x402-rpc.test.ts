import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  MONAD_TESTNET_USDC_ADDRESS,
  preflightMonadTestnet,
  readExactMonadPaymentReceipt,
} from "@/experimental/x402";

const buyer = `0x${"1".repeat(40)}` as const;
const seller = `0x${"2".repeat(40)}` as const;
const transaction = `0x${"a".repeat(64)}`;

function topic(address: string) {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function rpcFetch(results: Record<string, unknown>) {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as {
      jsonrpc: string;
      id: number;
      method: string;
    };
    return Response.json({
      jsonrpc: "2.0",
      id: request.id,
      result: results[request.method],
    });
  }) as unknown as typeof globalThis.fetch;
}

describe("Monad testnet RPC proof predicates", () => {
  it("requires the exact chain, deployed USDC, current payment balance, and gas", async () => {
    const fetchImpl = rpcFetch({
      eth_chainId: "0x279f",
      eth_getCode: "0x60006000",
      eth_getBalance: "0x1",
      eth_call: "0x0bb8",
    });
    const result = await preflightMonadTestnet({
      buyerAddress: buyer,
      sellerAddress: seller,
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(result).toEqual({
      providerCalls: 4,
      chainIdMatch: true,
      usdcContractPresent: true,
      buyerHasPaymentAsset: true,
      buyerHasNativeGas: true,
      buyerUsdcBalanceAtomic: "3000",
      buyerNativeBalanceWei: "1",
      ready: true,
    });
  });

  it("proves the exact successful USDC Transfer log", async () => {
    const fetchImpl = rpcFetch({
      eth_getTransactionReceipt: {
        transactionHash: transaction,
        status: "0x1",
        logs: [
          {
            address: MONAD_TESTNET_USDC_ADDRESS,
            topics: [
              "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
              topic(buyer),
              topic(seller),
            ],
            data: "0x0bb8",
          },
        ],
      },
    });
    await expect(
      readExactMonadPaymentReceipt({
        transactionReference: transaction,
        buyerAddress: buyer,
        sellerAddress: seller,
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      providerCalls: 1,
      confirmed: true,
      matchCodes: expect.arrayContaining([
        "CHAIN_RECEIPT_SUCCESS",
        "TRANSFER_LOG_AMOUNT_3000_MATCH",
      ]),
    });
  });

  it("rejects a transfer to any other seller", async () => {
    const fetchImpl = rpcFetch({
      eth_getTransactionReceipt: {
        transactionHash: transaction,
        status: "0x1",
        logs: [
          {
            address: MONAD_TESTNET_USDC_ADDRESS,
            topics: [
              "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
              topic(buyer),
              topic(`0x${"3".repeat(40)}`),
            ],
            data: "0x0bb8",
          },
        ],
      },
    });
    await expect(
      readExactMonadPaymentReceipt({
        transactionReference: transaction,
        buyerAddress: buyer,
        sellerAddress: seller,
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      code: "X402_CHAIN_RECEIPT_UNCONFIRMED",
      operationState: "unknown",
    });
  });
});
