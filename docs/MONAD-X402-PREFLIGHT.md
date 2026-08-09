# Monad x402 v2 preflight

**Status:** safeguarded buyer/seller path is build-ready behind closed gates.
One live read-only facilitator `/supported` call advertised x402 v2 `exact` on
Monad Testnet with valid EVM signers. No RPC, wallet, faucet, payment,
settlement, or paid resource request was made.

**Checked:** 2026-08-08

## Current official path

SpendForge uses the fixed-price `exact` flow on Monad Testnet:

1. The buyer requests the known supplier resource.
2. The supplier returns x402 v2 `402 Payment Required` metadata.
3. The official x402 client selects only the exact Monad/USDC requirement that
   matches the allowlisted seller and amount cap, signs server-side, and retries.
4. The supplier uses the official resource server and Monad facilitator to
   verify and settle only after its route handler succeeds.
5. SpendForge accepts settlement only from the decoded x402 payment-response
   header and keeps resource validation as a separate delivery state.

Verified official configuration:

| Setting | Value | Evidence |
|---|---|---|
| Protocol | x402 v2 | Monad guide says its facilitator supports v2 and above |
| Network | `eip155:10143` | Monad guide |
| Scheme | SDK `exact`; docs label the advertised capability `v2-eip155-exact` | Monad guide and installed SDK types |
| Asset | Monad Testnet USDC, 6 decimals | Monad guide |
| Asset address | `0x534b2f3A21130d7a60830c2Df862319e593943A3` | Monad guide |
| Facilitator | `https://x402-facilitator.molandak.org` | Monad guide |
| SpendForge price/cap | 3,000 atomic USDC (`0.003 USDC`) | Product spec and hard adapter cap |

For fixed USDC pricing, Monad recommends `exact`. The guide's warning to use
`@x402/evm` 2.12.0 specifically applies to the `upto` Permit2 proxy path;
SpendForge does not enable `upto`.

Official sources:

- [Monad x402 guide](https://docs.monad.xyz/guides/x402)
- [x402 buyer quickstart](https://docs.x402.org/getting-started/quickstart-for-buyers)
- [x402 seller quickstart](https://docs.x402.org/getting-started/quickstart-for-sellers)
- [x402 TypeScript packages](https://github.com/x402-foundation/x402/tree/main/typescript/packages)

## Installed package truth

All packages are pinned exactly, not ranged:

| Package | Version | Exports used/verified |
|---|---:|---|
| `@x402/core` | `2.21.0` | `x402Client`, `x402HTTPClient`, `HTTPFacilitatorClient`, `x402ResourceServer` |
| `@x402/evm` | `2.21.0` | `ExactEvmScheme` client/server and `ClientEvmSigner` |
| `@x402/fetch` | `2.21.0` | `wrapFetchWithPayment` |
| `@x402/next` | `2.21.0` | `withX402`, `RouteConfig` |

`@x402/next` 2.21.0 declares `next >=16.2.6`; this project uses Next 16.3.0.
The installed `@x402/next` ESM bundle imports extensionless `next/server`, which
raw Node ESM on Windows does not resolve. The package's published CJS export does
resolve, so the server-only seller adapter isolates a `createRequire` compatibility
shim. Typecheck and production build are required whenever this package changes.

The prior `X402_PACKAGE_UNVERIFIED` fallback was stale after this preflight.
Unconfigured live use now fails as `X402_CONFIGURATION_MISSING`.

## Safety and credential gates

The live factory refuses to start unless every condition below is true:

- Vercel reports `Preview`; Production is rejected.
- The distinct payment and seller kill switches are exactly enabled.
- The resource URL and seller address are explicitly allowlisted.
- Buyer and seller addresses differ.
- The per-attempt cap is exactly 3,000 atomic USDC or lower; the current seller
  route requires exactly 3,000.
- The call's idempotency key exactly matches one authorized attempt ID.
- A durable duplicate-attempt gate is injected. The included in-memory gate is
  fixture/test-only and is rejected in live mode.
- The buyer private key stays server-only and is never returned by a health,
  receipt, log, fixture, or client API.

Preview environment names (values must be configured out of chat):

- `MONAD_X402_PAYMENT_ENABLED`
- `MONAD_X402_SELLER_ENABLED`
- `MONAD_X402_RESOURCE_URL`
- `MONAD_X402_SELLER_ADDRESS`
- `MONAD_X402_AUTHORIZED_ATTEMPT_ID`
- `MONAD_X402_MAX_AMOUNT_ATOMIC`
- `MONAD_X402_BUYER_PRIVATE_KEY`
- `VERCEL_AUTOMATION_BYPASS_SECRET`
- `MONAD_RPC_URL`

The adapter records only safe operation evidence: attempt and endpoint
fingerprints, atomic amount/asset/network, timestamps, terminal or unknown
state, public settlement reference when present, and resource content hash.
It never stores payment headers, signatures, private keys, raw provider bodies,
or complete request payloads.

## What the offline proof establishes

Contract tests use the actual installed x402 client/seller packages with fake
402, payment-response, and `/supported` objects. They prove:

- the official client performs one unpaid request and one paid retry;
- only x402 v2, Monad Testnet, exact USDC, the expected seller, and an amount
  within the cap can reach signing;
- duplicate or non-authorized attempt IDs stop before transport work;
- a failure after signing becomes `unknown` and is not retried;
- settlement remains separate from resource-schema validation;
- the seller emits an official 402 only after the private attempt gate passes;
- fixtures remain `authoritative: false` even when they exercise official code.

This does **not** prove buyer balance, token-domain/signature acceptance,
settlement, or resource delivery on Monad Testnet. A live read-only
`/supported` response did establish v2 `exact` capability for `eip155:10143`
and valid EVM signers; it did not invoke a wallet or payment.

## Single next authorization gate

The Preview Postgres journal and restricted runtime role are deployed and
proven. The protected seller Route Handler, authenticated self-fetch seam,
durable run-wide buyer cap, seller settlement/delivery journal, encrypted
transaction recovery, and exact chain-receipt verifier are implemented and
fake-tested. The rail remains no-go because Preview has no configured distinct
buyer/seller, buyer key, protected self-fetch secret, RPC endpoint, or proven
post-reset testnet balances. The read-only `/supported` gate passed.

After those boundaries are wired and fake-tested, request one explicit
authorization in this exact scope:

> Authorize one Monad Testnet x402 v2 `exact` purchase for the configured
> SpendForge resource, capped at 3,000 atomic USDC, using the single configured
> attempt ID. Permit the initial resource GET, its one official paid retry, and
> the facilitator verify/settle calls. Do not retry an unknown outcome.

The authorized run must begin with the read-only facilitator `GET /supported`
preflight. It may proceed to payment only if that live response contains x402 v2
`exact` for `eip155:10143`. The resulting payment-response reference must be
preserved as testnet evidence; absent or malformed settlement remains unproven.
