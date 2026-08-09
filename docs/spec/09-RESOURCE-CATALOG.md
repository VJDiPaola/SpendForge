# Official Source and Resource Catalog

## Purpose

This catalog records the current public authorities used to build and verify
SpendForge. Third-party workshop PDFs and the superseded concept memo are held
only in the owner's private archive and are not public repository inputs.
Provider behavior that differs from documentation is recorded as redacted
observed evidence and kept non-terminal until authoritative readback proves it.

## Rain sandbox

| Resource | URL or value | Use |
|---|---|---|
| Workshop documentation | [rain-sandbox-trial.mintlify.site](https://rain-sandbox-trial.mintlify.site/) | Current sandbox guides and API Playground |
| OpenAPI | [openapi.json](https://rain-sandbox-trial.mintlify.site/openapi.json) | Published request/response contract; observed drift remains possible |
| Sandbox API base | `https://api-dev.raincards.xyz/v1` | Exact allowlisted server-only host |
| Scoped cards | [Scoped cards](https://rain-sandbox-trial.mintlify.app/docs/scoped-cards) | Issuance flow and documented controls |
| Session encryption | [Encryption outside the browser](https://rain-sandbox-trial.mintlify.app/docs/using-encryption-outside-of-a-browser-environment) | Ephemeral `sessionid` generation; PAN/CVC are never decrypted or stored |
| Authorizations | [Card authorizations](https://rain-sandbox-trial.mintlify.app/docs/simulating-transactions/card-authorizations) | Sandbox authorization request and response |
| Settlement | [Settlement](https://rain-sandbox-trial.mintlify.app/docs/simulating-transactions/settlement) | Sandbox settlement request and response |
| Transaction readback | [Get transaction](https://rain-sandbox-trial.mintlify.app/reference/transactions/get-a-transaction-by-its-id) | Authoritative exact-ID reconciliation |
| Idempotency | [Idempotency](https://rain-sandbox-trial.mintlify.app/reference/idempotency) | Provider idempotency semantics |

Configured identifiers such as API key, user ID, team ID, contract ID, raw card
ID, and raw transaction ID are server-only. They never enter prompts, fixtures,
screenshots, logs, or downloadable receipts.

Observed contract note: collateral funding returned HTTP 202 with a
`{success:boolean}`-shaped acknowledgment instead of the published correlated
response. SpendForge therefore leaves historical funding uncorrelated and does
not infer success from the boolean.

## Monad testnet

| Resource | URL or value | Use |
|---|---|---|
| Monad documentation | [docs.monad.xyz](https://docs.monad.xyz/) | Network and developer authority |
| Testnet reference | [Monad testnet](https://docs.monad.xyz/developer-essentials/testnet) | Current network status and reset notes |
| Testnet RPC | `https://testnet-rpc.monad.xyz` | Read-only chain and receipt reconciliation |
| Chain ID | `10143` | Testnet chain |
| CAIP-2 network | `eip155:10143` | x402 network identifier |
| Test USDC | `0x534b2f3A21130d7a60830c2Df862319e593943A3` | Testnet USDC contract for the selected x402 guide |
| JSON-RPC | [Monad JSON-RPC](https://docs.monad.xyz/reference/json-rpc/api) | Chain ID, balances, code, and exact receipt reads |
| Explorer | [MonadVision testnet](https://testnet.monadvision.com/) | Public transaction inspection after proof |
| Test assets | [Monad faucet](https://faucet.monad.xyz/) | Testnet MON when required |

Mainnet endpoints and assets are deliberately out of scope.

## x402 v2

| Resource | URL or value | Use |
|---|---|---|
| Monad x402 guide | [Monad x402](https://docs.monad.xyz/guides/x402) | Monad-specific v2/exact settings |
| Protocol docs | [docs.x402.org](https://docs.x402.org/) | Buyer, seller, facilitator, and extension semantics |
| Official repository | [x402-foundation/x402](https://github.com/x402-foundation/x402) | Installed package source and exports |
| Facilitator | `https://x402-facilitator.molandak.org` | Read-only `/supported`, then official verify/settle flow when enabled |

SpendForge pins these packages at `2.21.0`:

- `@x402/core`
- `@x402/evm`
- `@x402/fetch`
- `@x402/next`

The installed exports, not copied tutorial snippets, determine the adapter API.
The application uses only x402 v2 `exact` on `eip155:10143`, with distinct
buyer and seller addresses, a single durable attempt, and a 3,000-atomic-USDC
testnet cap.

## Application and verification

| Resource | URL | Use |
|---|---|---|
| Next.js App Router | [Next.js App Router](https://nextjs.org/docs/app) | Application and Route Handler model |
| Vercel deployments | [Vercel deployments](https://vercel.com/docs/deployments) | Protected Preview hosting |
| Vercel deployment protection | [Deployment protection](https://vercel.com/docs/security/deployment-protection) | Preview authentication boundary |
| OpenAI structured outputs | [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) | Strict bounded purchase proposal |
| Supercut | [supercut.ai](https://supercut.ai/) | Optional owner-run recording tool |

## Review rules

- Official current docs and installed exports outrank historical examples.
- Redacted observed provider shapes may widen parsers only for explicitly seen
  variants; causal value predicates and caps remain strict.
- A fixture, response acknowledgment, or authorization is not settlement.
- Rain success requires exact terminal provider readback.
- Monad success requires facilitator response plus exact chain receipt evidence
  and causal resource delivery.
- No code is copied from an external repository without license and version
  review.
