# Demo Notes

## Current truth

**A local application, fixture demo, and protected Vercel Preview exist. One bounded live OpenAI Responses call produced a durable strict purchase proposal that deterministic policy independently verified; it did not authorize payment. Rain Sandbox directly confirmed a fresh active virtual scoped card and accepted a 12-USD-cent authorization. A later exact GET matched every causal field, then exactly one settlement POST returned HTTP 400 and three bounded readbacks stayed nonterminal. That settlement outcome is ambiguous and will not be retried; completed spend is not proven. Historical funding remains an uncorrelated HTTP 202 acknowledgment. Monad's read-only `/supported` preflight passed, but payment, replay capture, and demo recording remain unproven.**

- The private source repository is `https://github.com/VJDiPaola/SpendForge`.
- The Next.js production build succeeds locally and on the protected Preview.
- The Atlas fixture mission, audited purchase proposal, policy decisions, cross-rail ledger, and protected-Preview/local artifact route work.
- Fixture payments are always `authoritative: false` and say that no provider transaction was submitted.
- The Rain live adapter implements current published schemas, ephemeral server-side `sessionid`, operation-specific idempotency keys, and direct readback.
- Official x402 v2 packages are pinned; the protected seller, durable buyer/seller evidence, cumulative cap, chain-check seam, and fake contracts pass tests. One read-only facilitator `/supported` call passed; no wallet, RPC, payment, settlement, or paid-delivery call has been made.
- Unit and contract tests cover deterministic policy, atomic money, idempotency, redaction, Rain contracts, official x402 boundaries, settlement/delivery separation, and health output.
- The fixture decision adapter and representative safety evals remain the default path. One separately gated live Responses call used `gpt-5.6-terra`, 1,617 total tokens, strict structured output, no tools, and no retry; its execution route and gates are now closed.
- A dedicated Preview-only Neon journal has the migration applied and a restricted runtime role. Synthetic protected-Preview proof established one winner under concurrent duplicate claims and persistence across separate database connections, with zero provider or model calls.
- All seven maintained Chromium browser stories pass, including decision disclosure, failure modes, ledger proof links, artifact truth, and secret-free health output.

## Rain Sandbox evidence

All operations below used protected Preview-scoped Rain variables, fresh operation-specific idempotency, one-attempt gates, and redacted evidence. No production credentials or funds were used.

### Fresh funding v3 and prior schema evidence

- The original proof attempt stopped at collateral funding when the HTTP-success response diverged from the published `{ transactionId: UUID }` schema.
- A later funding-shape attempt established the actual redacted response shape as HTTP `202` with `{ success: boolean }`, without a provider correlation identifier.
- The fresh funding v3 operation made exactly one new `POST /simulate/collateral/fund` mutation with its own idempotency key. It again returned HTTP `202` with `{ success: boolean }` and no request or correlation reference.
- One subsequent `GET /issuing/transactions` narrowed to the funding v3 window, collateral type, and expected amount/currency found no plausible candidate. No detail GET was made.
- **Funding truth:** an HTTP 202 acknowledgment was observed; completed funding was not proven. Do not retry or treat `{ success: true }` as settlement without a supported correlation/readback path.

### Scoped card

- A separate, explicitly authorized one-shot operation submitted one scoped-card request with a 12-USDC-cent cap in the request payload.
- Rain returned HTTP `200` with a validated scoped-card response.
- One direct card GET matched the same card ID and user ID and reported an `active` `virtual` card.
- The readback exposed limit fields, but their values were neither persisted nor compared. It therefore does **not** independently prove that the 12-USDC-cent cap was applied, even though that cap was present in the submitted request.
- **Historical-card truth:** issuance and active virtual status are provider-confirmed for that matched card/user. Its cap enforcement and spend were not proven.

### Recording-build card authorization

- A fresh exact-attempt operation durably claimed a new scoped-card issuance,
  requested 12 USDC cents plus MCC `5734`, encrypted the recoverable card
  reference server-side, and discarded PAN/CVC without decrypting or storing it.
- Rain returned a schema-valid card response and direct GET matched the same
  card/user as `active` and `virtual`. Any cap semantics remain limited to the
  submitted request unless the provider readback explicitly matches them.
- A separately claimed 12-USD-cent authorization returned a schema-valid
  `authorized` response and its transaction reference was encrypted before the
  dependent read.
- A later exact transaction GET matched transaction, card, user, 12-cent amount,
  currency, merchant, MCC, virtual-card type, and an open provider status after
  case/outer-whitespace-only normalization.
- SpendForge durably claimed and submitted **exactly one settlement POST**. Rain
  returned HTTP 400, and three bounded exact readbacks remained nonterminal.
  The outcome is provider-ambiguous: there is no completed-spend or money-
  movement claim, and the settlement will not be retried. All Rain execution
  routes were removed and every gate is closed in the final build.

### Request and closure boundary

- Funding v3: one funding mutation, one transaction-list GET, zero detail GETs, and no dependent card/authorization/settlement calls.
- Scoped card: one issue mutation and one direct card GET.
- Recording and reconciliation phases: three Rain mutations (card issue,
  authorization, and one settlement submission), plus the bounded exact reads
  recorded by the durable receipt. No new funding call occurred. The final
  settlement branch used one reconciliation GET, one settlement POST, and three
  terminal-status GETs; it stopped nonterminal and made no retry.
- OpenAI recording phase: one Responses API call, 1,617 total tokens, no tools,
  no retry, and zero payment-provider calls from that decision path.
- Monad recording phase: one read-only facilitator `/supported` call, zero RPC,
  wallet, seller-payment, settlement, or paid-delivery calls.
- Each short-lived open Preview deployment was removed after its authorized invocation. The associated execution windows default closed to prevent duplicates.
- The checked-in Rain journal is an archival capture persisted after the bounded calls. Separately, the Postgres compare-and-set provider-operation journal is deployed and proven on protected Preview with a restricted runtime role. Runtime mutation paths fail closed when the store is absent or unavailable. Mission runs, model decisions, cumulative budgets, payments, deliveries, and artifacts are not yet canonical database records.

A prepared fixture or replay does not prove a live integration.

## Intended happy path

1. Open a mission with a `$0.25` synthetic budget.
2. Review the operator's hard constraints and success checks.
3. Start the agent once; do not approve each allowed purchase.
4. Show the agent buying an x402 resource on Monad testnet.
5. Show the agent using a Rain sandbox scoped card for a legacy resource.
6. Show an expensive resource being declined and an over-budget attempt being blocked.
7. Reveal the composed launch artifact and deterministic evaluation results.
8. Open the audit ledger and provider receipts.
9. Show a future-budget proposal that still requires operator acceptance.

## Required environment labels

- `RAIN SANDBOX`
- `MONAD TESTNET`
- `SYNTHETIC MISSION`
- `REPLAY` when replaying a captured run

## Real versus seeded matrix

| Element | Current status | Evidence boundary |
|---|---|---|
| Rain scoped card | Provider-confirmed in workshop sandbox | Direct GET matched card/user and active virtual status; submitted cap not independently verified |
| Rain funding and spend | Partial / provider-ambiguous; no completed-spend proof | Funding HTTP 202 had no correlation. Card and authorization evidence are durable. One settlement POST returned HTTP 400 and three exact readbacks stayed nonterminal; no retry is permitted. |
| Monad x402 payment | Unproven | Live read-only `/supported` capability passed; protected seller and contract tests are ready, but no wallet, RPC, payment, chain receipt, or paid delivery occurred. |
| Bounded agent proposal | One live model proof plus fixture fallback | One strict `gpt-5.6-terra` proposal was durably recorded and policy-verified; the animated mission remains a labeled fixture. |
| Provider-operation durability | Proven on protected Preview | Restricted Neon runtime role, concurrent CAS winner/duplicate block, and cross-connection persistence; zero provider calls |
| Resource offers and deliveries | Seeded fixture | Catalog provenance, fixture manifests, and hashes visible in UI |
| Artifact composition | Real application route using fixture manifests | Protected-Preview/local route and deterministic composition are inspectable; no provider payment attribution |
| Evaluation | Deterministic fixture evidence | Versioned results are product evidence, not provider evidence |
| Customer/adoption claims | Not used | N/A |

## Fallback policy

- Capture one verified live run as soon as both rails work.
- Store a redacted replay fixture containing no secrets.
- If a provider is unavailable during judging, use the replay with a visible `REPLAY` badge and explain when it was captured.
- Never silently swap live mode for fixture mode.
