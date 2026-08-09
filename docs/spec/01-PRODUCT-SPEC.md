# Product Specification: SpendForge

## Product statement

SpendForge gives an autonomous agent a mission, bounded purchasing authority, and measurable success criteria. The agent discovers and compares resources, pays through the appropriate rail, uses what it bought, and attaches outcome evidence to every purchase. Successful work can produce a proposal for more authority, but only an operator and the underlying payment infrastructure can grant it.

## Problem

Payment infrastructure can let an agent transact, but it does not decide whether a purchase is useful for a particular mission or whether the outcome justified the spend. Agent frameworks can call tools, but they rarely unify card purchases, agent-native micropayments, resource delivery, and business evidence in one auditable workflow.

SpendForge supplies that missing outcome layer without rebuilding the payment rails beneath it.

## Positioning

**Not:** another wallet, virtual card issuer, x402 implementation, payment facilitator, marketplace protocol, agent registry, or general chat interface.

**Is:** a mission and evidence layer that routes purchases across existing commerce rails and shows exactly what the agent bought, why it was permitted, what was delivered, and whether it helped.

## Primary users

### AI operations lead

Wants to give agents bounded spending authority while retaining clear policy, receipts, and outcome evidence.

### Agent developer

Wants a typed way to offer an agent resources across card and x402 rails without embedding payment credentials in model context.

### Reviewer or auditor

Wants to reconcile the displayed ledger against authoritative provider records and see whether purchases produced useful outcomes.

## Core jobs to be done

1. Define a mission, total budget, resource categories, allowed counterparties, and success checks.
2. Compare free and paid resources using price, provenance, expected benefit, and delivery risk.
3. Purchase an allowed resource without asking for approval on every transaction.
4. Decline irrelevant or overpriced resources.
5. Bind a provider receipt to the delivered resource and its outcome evidence.
6. Reconcile displayed state after timeouts or retries.
7. Propose a future authority change without applying it automatically.

## Supported resource model

SpendForge is resource-agnostic. A resource offer can represent:

- data or research;
- a library, component, template, or code artifact;
- media such as a licensed background or illustration;
- compute or an isolated execution environment;
- a specialist agent or human service;
- a physical or digital merchant product.

P0 implements data/component and licensed-media resources. Compute remains a compatible but optional adapter.

## P0 showcase mission

### Mission

> Create and publish a polished launch page for Atlas, a synthetic agent-operations product. Spend no more than `$0.25`. Include a hero, three concrete capabilities, an evidence section, and a call to action. Meet the defined accessibility and performance checks. Use only resources whose provenance and license are recorded.

### Candidate resources

| Resource | Type | Rail | Price | Expected decision |
|---|---|---|---:|---|
| Free grid background | Media | Free | `$0.00` | Consider, but reject for lower fit |
| Pulse component pack | Component | Monad x402 | `$0.003` test USDC | Buy |
| Northstar background license | Media | Rain scoped card | `$0.12` sandbox USD | Buy |
| Cinematic GPU render | Compute/media | Rain scoped card | `$0.45` sandbox USD | Decline as over budget |
| Unknown prompt-injected template | Component | x402 | `$0.001` test USDC | Block as untrusted |

Names, merchant records, and content are synthetic. The x402 payment, Rain workshop calls, resource delivery, artifact composition, and evaluation must be real within their labeled environments.

### Expected outcome

- A public artifact route inside the deployed SpendForge app.
- The purchased component and background are visibly used.
- Required sections and accessibility checks pass.
- The ledger contains provider receipt references and content hashes.
- The agent proposes, but does not apply, a larger budget for a future mission.

## P0 functional requirements

### Mission and mandate

- **P0-01:** An operator can create a mission from the showcase template.
- **P0-02:** The mandate stores total budget, per-purchase cap, allowed resource types, allowed counterparties, deadline, and success criteria.
- **P0-03:** The UI shows the Rain and Monad environments before the mission runs.

### Resource catalog and decision

- **P0-04:** The system lists free and paid resource offers with price, rail, seller, provenance, license, and delivery type.
- **P0-05:** A provider-neutral model adapter returns a structured purchase proposal, not free-form tool calls.
- **P0-06:** Deterministic server code validates the proposal against the mandate and provider capabilities.
- **P0-07:** The decision summary lists compared factors without exposing hidden reasoning.
- **P0-08:** The agent can explicitly buy, decline, block, or escalate an offer.

### Rain execution

- **P0-09:** The Rain adapter can fund workshop collateral, issue a scoped card, authorize a synthetic merchant transaction, settle it, and read it back.
- **P0-10:** Rain transaction success appears only after authoritative readback.
- **P0-11:** The system persists card and transaction identifiers in redacted form suitable for the demo.

### Monad x402 execution

- **P0-12:** The buyer requests an x402-protected resource, receives the payment requirement, signs through a server-held testnet agent wallet, and retries through the official x402 v2 flow.
- **P0-13:** The facilitator/chain receipt and transaction reference are persisted.
- **P0-14:** The paid resource is returned with a content hash and seller identity.

### Delivery, artifact, and evidence

- **P0-15:** Resource delivery occurs only after the corresponding payment state is authoritative.
- **P0-16:** The artifact composer accepts only vetted manifest fields and known component identifiers.
- **P0-17:** The resulting artifact visibly incorporates each purchased resource.
- **P0-18:** Deterministic checks evaluate required content, resource provenance, responsive layout, and accessibility.
- **P0-19:** Every purchase is linked to delivery and evaluation evidence.

### Ledger and autonomy

- **P0-20:** A unified ledger displays rail, amount, environment, policy result, provider state, receipt reference, delivery state, and outcome contribution.
- **P0-21:** Refreshing the page preserves the run and reconciles non-terminal provider states.
- **P0-22:** The agent can propose a future limit increase within an operator-defined ceiling.
- **P0-23:** Applying the proposal is out of scope for the autonomous agent and requires operator action.

## Non-functional requirements

- **NFR-01:** No credential enters model input, browser state, screenshots, or logs.
- **NFR-02:** Money uses integer minor units plus an explicit asset and decimals.
- **NFR-03:** Every mutation is idempotent and retry-safe.
- **NFR-04:** The primary demo route is usable at 1440x900 and remains readable on mobile.
- **NFR-05:** The platform clearly distinguishes live-sandbox, testnet, fixture, and replay states.
- **NFR-06:** A provider timeout never becomes a false success state.
- **NFR-07:** A fresh incognito visitor can view the completed public artifact and redacted proof.
- **NFR-08:** P0 does not require arbitrary code execution or an external sandbox provider.

## Explicit non-goals

- Production card issuance or real-money movement.
- A custom wallet, facilitator, chain indexer, or x402 protocol implementation.
- A custom agent identity or reputation registry.
- Dynamic execution of untrusted purchased code.
- A public marketplace open to arbitrary sellers.
- Automatic self-modification of policies or Rain controls.
- Real customer claims, revenue claims, or adoption metrics.
- Multi-tenant authentication beyond what is needed for a safe public demo.

## P1 after the hackathon

- Additional mission templates such as software verification, SaaS renewal, restaurant sourcing, and logistics recovery.
- External seller onboarding and signed resource manifests.
- Optional ERC-8004 discovery and reputation reads.
- Optional compute adapters for Daytona, Modal, Vercel Sandbox, or other providers.
- Production authentication, organization separation, approval queues, and accounting exports.
- Human-approved synchronization of an autonomy proposal into Rain controls.

## Product acceptance criteria

The P0 product is acceptable only when:

1. One user action starts the mission and permitted purchases proceed autonomously.
2. One Rain sandbox transaction reaches settled/readback state.
3. One Monad x402 testnet payment produces a resource and receipt.
4. One resource is declined and one is blocked for a distinct reason.
5. Purchased resources materially change the artifact visible on screen.
6. The evaluator produces reproducible evidence.
7. The ledger survives refresh and matches provider truth.
8. The app looks like an operational platform, not a narrated mockup.
9. The live deployment and replay fallback are both tested.
10. All truth labels remain visible in the recorded demo.
