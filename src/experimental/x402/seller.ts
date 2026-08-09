import "server-only";

import { createRequire } from "node:module";

import {
  HTTPFacilitatorClient,
  x402ResourceServer,
  type FacilitatorClient,
  type RouteConfig,
} from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { decodePaymentResponseHeader } from "@x402/core/http";
import type * as X402Next from "@x402/next";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  MONAD_TESTNET_NETWORK,
  MONAD_TESTNET_USDC_ADDRESS,
  MONAD_X402_FACILITATOR_URL,
  SPENDFORGE_X402_ATTEMPT_HEADER,
  SPENDFORGE_X402_PRICE_ATOMIC,
  SPENDFORGE_X402_SCHEME,
} from "@/experimental/x402/constants";
import { X402AdapterError } from "@/experimental/x402/errors";
import {
  readMonadX402SellerEnvironment,
  type MonadX402SafetyConfig,
} from "@/experimental/x402/safety";

type RouteHandler<T> = (request: NextRequest) => Promise<NextResponse<T>>;

// @x402/next 2.21.0's ESM build imports the extensionless `next/server`
// subpath, which raw Node ESM cannot resolve on Windows. Its published CJS
// export resolves correctly, while Next's bundler also supports this server-only
// module. Keep the compatibility shim isolated here until the package fixes it.
const { withX402 } = createRequire(import.meta.url)("@x402/next") as typeof X402Next;

export type MonadX402SellerOptions = {
  safety: MonadX402SafetyConfig;
  facilitatorClient: FacilitatorClient;
  onSettledDelivery?: (input: {
    transactionReference: string;
    amountAtomic: string;
    network: typeof MONAD_TESTNET_NETWORK;
    observedAt: string;
  }) => Promise<void>;
};

export type CreateMonadX402SellerOptions = {
  facilitatorClient?: FacilitatorClient;
  environment?: NodeJS.ProcessEnv;
  onSettledDelivery?: MonadX402SellerOptions["onSettledDelivery"];
};

/**
 * Configures the official x402 v2 resource server for the synthetic Pulse
 * supplier. It does not initialize the facilitator or make a network request
 * until a correctly gated route is invoked.
 */
export class MonadX402SellerAdapter {
  private readonly resourceServer: x402ResourceServer;
  private readonly routeConfig: RouteConfig;

  constructor(private readonly options: MonadX402SellerOptions) {
    if (
      !options.safety.previewOnly ||
      !options.safety.sellerEnabled ||
      !options.safety.paymentEnabled
    ) {
      throw new X402AdapterError("X402_KILL_SWITCH_CLOSED", "not_started");
    }
    if (options.safety.maxAmountAtomic !== SPENDFORGE_X402_PRICE_ATOMIC) {
      throw new X402AdapterError("X402_CONFIGURATION_MISSING", "not_started");
    }

    this.resourceServer = new x402ResourceServer(
      options.facilitatorClient,
    ).register(MONAD_TESTNET_NETWORK, new ExactEvmScheme());

    this.routeConfig = {
      accepts: {
        scheme: SPENDFORGE_X402_SCHEME,
        network: MONAD_TESTNET_NETWORK,
        payTo: options.safety.sellerAddress,
        price: {
          amount: SPENDFORGE_X402_PRICE_ATOMIC,
          asset: MONAD_TESTNET_USDC_ADDRESS,
          extra: { name: "USDC", version: "2" },
        },
        maxTimeoutSeconds: 300,
      },
      resource: options.safety.allowedResourceUrl,
      description: "SpendForge Pulse component manifest (synthetic demo supplier)",
      mimeType: "application/json",
      serviceName: "SpendForge synthetic supplier",
    };
  }

  getRouteConfig(): RouteConfig {
    return structuredClone(this.routeConfig);
  }

  hasExactMonadScheme(): boolean {
    return this.resourceServer.hasRegisteredScheme(
      MONAD_TESTNET_NETWORK,
      SPENDFORGE_X402_SCHEME,
    );
  }

  protect<T>(handler: RouteHandler<T>): RouteHandler<T> {
    let paidHandler: RouteHandler<T> | undefined;

    return async (request: NextRequest) => {
      if (
        request.headers.get(SPENDFORGE_X402_ATTEMPT_HEADER) !==
        this.options.safety.authorizedAttemptId
      ) {
        return NextResponse.json(
          { code: "X402_ATTEMPT_NOT_AUTHORIZED" },
          { status: 403 },
        ) as NextResponse<T>;
      }
      paidHandler ??= withX402(
        handler,
        this.routeConfig,
        this.resourceServer,
      );
      const response = await paidHandler(request);
      const paymentResponse = response.headers.get("payment-response");
      if (response.status < 400 && paymentResponse && this.options.onSettledDelivery) {
        try {
          const decoded = z
            .object({
              success: z.literal(true),
              transaction: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
              network: z.literal(MONAD_TESTNET_NETWORK),
              amount: z.literal(SPENDFORGE_X402_PRICE_ATOMIC),
            })
            .passthrough()
            .parse(decodePaymentResponseHeader(paymentResponse));
          await this.options.onSettledDelivery({
            transactionReference: decoded.transaction,
            amountAtomic: decoded.amount,
            network: decoded.network,
            observedAt: new Date().toISOString(),
          });
        } catch {
          return NextResponse.json(
            { code: "X402_SELLER_EVIDENCE_UNAVAILABLE" },
            { status: 503 },
          ) as NextResponse<T>;
        }
      }
      return response;
    };
  }
}

export function createMonadX402SellerAdapter(
  options: CreateMonadX402SellerOptions = {},
): MonadX402SellerAdapter {
  const safety = readMonadX402SellerEnvironment(options.environment);
  return new MonadX402SellerAdapter({
    safety,
    facilitatorClient:
      options.facilitatorClient ??
      new HTTPFacilitatorClient({
        url: MONAD_X402_FACILITATOR_URL,
        timeoutMs: 10_000,
      }),
    onSettledDelivery: options.onSettledDelivery,
  });
}
