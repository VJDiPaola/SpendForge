# Capability Boundaries and Non-Duplication Contract

## Purpose

This document defines which system is authoritative for each capability. It exists to prevent SpendForge from rebuilding infrastructure already supplied by Rain, Monad, x402, or Vercel.

## Architectural rule

SpendForge may **configure, invoke, reconcile, and display** provider capabilities. It must not replace provider enforcement or settlement with local prompts, database flags, or lookalike simulations.

## Capability ownership matrix

| Capability | Authoritative owner | SpendForge responsibility | Do not build |
|---|---|---|---|
| Stablecoin-backed virtual card | Rain | Request a scoped card for an approved purchase and store its redacted identifier | Card issuance, PAN handling, card ledger |
| Merchant/MCC/amount/frequency/expiry controls | Rain Agent Control Layer | Translate a human mandate into supported Rain parameters; preflight stricter local constraints | A competing card-control engine or claims that prompt rules enforce card spend |
| Card authorization and settlement | Rain | Invoke typed adapter methods and reconcile provider responses | Custom authorization logic or local settlement states |
| Transaction readback | Rain | Treat final readback as provider truth and link it to evidence | Marking a purchase settled from an optimistic UI event |
| Payment routes and money movement | Rain | Optional future adapter using documented endpoints | Custom on/off-ramp or transfer network |
| HTTP payment challenge | x402 | Use official server/client packages | Custom 402 headers, signature format, or protocol fork |
| Payment verification and onchain settlement | Monad x402 facilitator | Configure the official facilitator and preserve its receipt | Custom facilitator, gas sponsorship, or settlement contract |
| Agent testnet wallet | Selected wallet implementation | Keep signing server-side and expose only address/receipt data | Wallet custody product or private-key handling in the model/browser |
| Chain RPC and token metadata | Monad infrastructure | Read configured network and token identifiers | Custom RPC node, token list, or chain indexer |
| Agent identity and reputation | ERC-8004, if later selected | Read optional identity/reputation data after P0 | Custom identity NFT, reputation registry, or validation registry |
| Mission, expected value, and resource comparison | SpendForge | Define and implement | Delegating provider-specific enforcement to the model |
| Cross-rail resource catalog | SpendForge | Normalize offers without hiding their native checkout rail | A replacement payment protocol |
| Delivery and provenance evidence | SpendForge plus seller | Bind delivered content to payment and mission | Treating payment alone as proof of delivery |
| Outcome evaluation | SpendForge | Run deterministic mission-specific checks | Claiming provider settlement proves usefulness |
| Unified audit ledger | SpendForge | Project provider truth into a cross-rail view | A shadow financial ledger that contradicts provider state |
| Future-authority proposal | SpendForge | Recommend a bounded change based on evidence | Letting the model mutate Rain controls or its own hard rules |
| Application hosting | Vercel | Deploy and operate the Next.js app | Custom hosting control plane |

## Rain boundary

Rain's June 2026 Agent Control Layer announcement says controls are embedded across Rain APIs and enforced at issuance and initiation. Supported dimensions include merchant category codes, approved merchants or recipients, amounts, frequency, active-card caps, and expiry. The same announcement describes money-movement controls for approved counterparties, timing, and amount.

Primary reference: [Rain Agent Control Layer announcement](https://www.prnewswire.com/news-releases/rain-releases-agent-control-layer-bringing-programmatic-spending-guardrails-to-agentic-payments-302794541.html)

Current Rain workshop documentation and observed sandbox behavior define this
sequence:

1. `POST /simulate/collateral/fund`
2. `POST /issuing/users/{userId}/cards/scoped`
3. `POST /simulate/transactions/authorize`
4. `POST /simulate/transactions/{id}/settle`
5. `GET /issuing/transactions?limit=20`
6. Optional `POST /payment-routes`
7. Optional `POST /simulate/payment-routes`

Published examples can lag the live sandbox. Implementation agents must inspect
the workshop playground, current OpenAPI, and redacted observed shapes before
creating types. Do not infer additional request fields from marketing copy.

### Local policy versus Rain enforcement

SpendForge's mandate can be stricter than Rain. For example, it may decline a `$0.14` purchase because expected value is too low even if Rain would permit it. This is a product decision, not payment enforcement.

When SpendForge permits a purchase, Rain remains the final authority. A local `allowed` result never implies that Rain will authorize or settle the transaction.

## Monad and x402 boundary

The official Monad x402 guide defines the payment flow:

1. Buyer requests a resource.
2. Seller returns HTTP `402` and a payment requirement.
3. Buyer signs an authorization and retries.
4. Server verifies through the facilitator and serves content.
5. Facilitator settles onchain.

References:

- [Monad x402 guide](https://docs.monad.xyz/guides/x402)
- [Monad agentic payments](https://docs.monad.xyz/tooling-and-infra/agentic-payments)
- [x402 TypeScript packages](https://github.com/x402-foundation/x402/tree/main/typescript)
- [x402 protocol documentation](https://docs.x402.org/)

The Monad facilitator supports x402 v2 and provides `/supported`, `/verify`, and `/settle`. SpendForge must use the official packages and facilitator instead of constructing protocol messages manually.

### ERC-8004 decision

ERC-8004 already defines agent identity, reputation, and a planned validation registry. Monad's guide says the validation registry is coming soon. P0 therefore does not implement identity or reputation. A later version may read ERC-8004 data, but SpendForge must not create a competing registry.

References:

- [Monad ERC-8004 guide](https://docs.monad.xyz/guides/erc-8004)
- [ERC-8004 GitHub organization](https://github.com/erc-8004)

### MPP decision

Monad also documents the Machine Payments Protocol and an `@monad-crypto/mpp`
SDK. P0 uses x402 because it is the selected official HTTP-payment path. Do not
implement both protocols during the hackathon.

Reference: [Monad MPP overview](https://docs.monad.xyz/reference/mpp/overview)

## Vercel boundary

Vercel hosts the Next.js application, functions, and runtime logs. SpendForge uses:

- App Router pages and layouts for the platform UI;
- Server Actions for internal UI mutations;
- Route Handlers for the orchestration stream, external integrations, and x402 resource endpoint;
- the default Node.js runtime for provider SDK compatibility;
- runtime logs and request IDs for operational diagnosis.

References:

- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Vercel runtime logs](https://vercel.com/docs/logs/runtime)

SpendForge must not rely on in-memory state between Vercel requests. Durable run, ledger, and idempotency state belongs in the database.

## Optional provider boundary

Daytona, Modal, Vercel Sandbox, Claude Code, and similar tools may later satisfy a `ComputeResourceProvider` or `WorkerAgent` interface. None is required for P0 because the showcase composes vetted resources rather than executing arbitrary code.

An optional provider may be added only when:

1. its use changes the mission outcome rather than serving as a logo;
2. credentials and current SDK behavior are proven within 45 minutes;
3. its failure has a truthful fallback;
4. provider-specific types remain behind an adapter;
5. the demo does not imply that Rain or Monad performed the provider's work.

## Explicit do-not-build list

- Virtual card or wallet implementation.
- Card number display or handling.
- Merchant, MCC, velocity, expiry, or recipient enforcement that claims to replace Rain.
- x402 message formats, paywall middleware, facilitator, or settlement contract.
- Monad RPC, block explorer, or token registry.
- ERC-8004 identity, reputation, or validation contracts.
- A public arbitrary-seller marketplace.
- A general-purpose sandbox in P0.
- A chain-of-thought viewer.
- An editable agent policy that the agent can change itself.

## API drift preflight

Before implementation, the integration owner must record:

| Check | Required evidence |
|---|---|
| Rain workshop base URL and auth headers | Successful authenticated read or playground request |
| Rain request/response schemas | Saved redacted examples plus local runtime validation schemas |
| Rain scoped-card controls available in this workshop tenant | Playground/schema inspection; do not assume every marketing control is enabled |
| Installed `@x402/*` package versions | `package.json`, lockfile, and exported type inspection |
| Facilitator-supported networks and schemes | Live `GET /supported` response |
| Monad chain, RPC, and USDC address | Official docs plus live RPC read |
| Wallet signing interface | Disposable testnet payment smoke test |
| Database provider | Successful migration and persisted refresh test on Vercel preview |

Any mismatch updates this document before higher-level app behavior changes.
