# SpendForge judging map

**Purpose:** adversarial claim review, not promotional copy.
**Current snapshot:** one live bounded OpenAI proposal; durable Preview-only CAS
journal; Rain Sandbox card issuance/readback plus an accepted authorization;
one settlement POST followed by nonterminal readbacks; zero completed-spend
proof; one read-only Monad `/supported` call and zero Monad payment calls. The animated mission, payments,
deliveries, and artifact remain labeled fixtures.

## Judge questions

| Question | Evidence-backed answer | Inspectable proof |
|---|---|---|
| Is the agent deciding? | **Yes, narrowly.** One protected Preview Responses call proposed the fixed-catalog Pulse resource with a one-cent maximum. Deterministic code independently verified the quote, vendor, evidence, caps, duplicate state, and policy rules. The model had no payment tools and could not override policy. | Live decision card and downloadable receipt in `/ledger`; model/prompt versions, input/output digests, 1,617-token usage, structured output, and policy result. |
| Did money move? | **Not proven.** Rain accepted a sandbox authorization and an exact GET later matched the causal fields. One settlement POST returned HTTP 400; three exact readbacks remained nonterminal, so the outcome stays ambiguous and will not be retried. Monad payment was not attempted. | Rain redacted attempt receipt: card/readback, authorization, causal reconciliation, one settlement submission, and three nonterminal readbacks. |
| What uniquely did Rain enable? | Rain supplied provider-owned scoped-card issuance, active/virtual direct readback, and a sandbox authorization response for a synthetic programmatic merchant. SpendForge did not rebuild card issuance or provider authorization. | Masked Rain operation references, response shapes, readback states, and kill-switch/CAS evidence. |
| Can every claim be proved? | Every **current** provider/model claim is scoped to a downloadable redacted receipt. The full fixture outcome is product evidence, not a causal live-payment graph. | Ledger truth labels, live decision receipt, Rain attempt receipt, fixture receipt, artifact proof strip. |
| Is there a credible fallback? | Yes. The labeled fixture demonstrates the full decision/policy/delivery/outcome contract, while Rain and Monad safe-stop screens freeze dependent work without inventing success. | Mission demo navigator, failure views, backup script, deterministic tests. |

## Why this is an agent rather than a chatbot

The model receives a fixed catalog, mission, quoted integer prices, policy
context, and prior evidence. It returns only a strict proposal:
`APPROVE | REJECT | NEEDS_REVIEW`, selected resource, maximum cents, concise
rationale, evidence IDs, risks, and confidence. Deterministic code remains
execution authority. The legitimate autonomy is resource selection inside a
standing mandate, not unrestricted purchasing.

## Product-market boundary

Primary fit: low-value, preapproved, machine-deliverable resources such as API
access, dataset slices, model inference, compute, enrichment/verification,
OCR/transcription, test infrastructure, and sandbox time. Northstar is a
synthetic programmatic merchant whose API returns a licensed versioned asset
manifest. Browser-oriented media/code licenses are secondary.

SpendForge does not replace enterprise software procurement, negotiated
contracts, legal/tax review, vendor onboarding, seat lifecycle, renewals, or
cancellations. The future [Checkout Operator](./CHECKOUT-OPERATOR.md) uses
authenticated human handoff for challenges and irreversible commits; it does
not bypass merchant controls.

## Ranked remaining gaps

1. **P0 — no terminal Rain spend proof.** The accepted authorization needs an
   exact matching transaction readback and separately claimed settlement before
   any completed-spend claim.
2. **P0 — no Monad x402 payment proof.** The packages, protected seller, durable evidence seams, and fake contracts are current; live `/supported` passed read-only,
   but seller route, authenticated self-fetch, wallet/test assets, `/supported`,
   facilitator settlement, chain readback, and causal delivery remain absent.
3. **P0 — no canonical full-run graph.** The operation journal is durable, but
   the animated mission and artifact are regenerated fixtures.
4. **P0 — cumulative budget is enforced in the local guard, not yet reserved
   as a run-scoped database balance across distinct concurrent purchases.**
5. **P0 — Rain funding remains uncorrelated.** HTTP 202 `{success:boolean}`
   conflicts with the published `{transactionId}` contract.
6. **P1 — reconciliation executor drift.** The direct Rain record shape was
   captured safely, but the final read-only executor stopped before provider
   transport after configuration readiness passed. Do not reopen it without a
   new bounded diagnosis.
7. **P1 — observability.** Operation receipts are strong, but a full causal run
   trace and worker/webhook reconciliation path are not implemented.

## Claim filter

Allowed:

- “SpendForge is autonomous microprocurement inside a human-set mandate.”
- “One bounded live OpenAI proposal selected Pulse; deterministic policy
  independently verified it.”
- “Rain Sandbox issued and read back a fresh active virtual card, then accepted
  a 12-cent authorization.”
- “SpendForge submitted settlement exactly once; Rain returned HTTP 400 and
  readbacks stayed nonterminal, so no completed spend is claimed.”
- “Historical Rain funding returned HTTP 202 with no causal identifier.”
- “The Preview-only append-only journal and duplicate barrier are proven.”
- “Monad is an official-package, fake-contract path with no live testnet call.”

Blocked:

- “The agent completed a Rain card transaction.”
- “Money moved” or “Rain settled.”
- “Rain independently verified the requested exact card cap.”
- “The agent paid over x402 on Monad Testnet.”
- “Both rails are live.”
- “The fixture artifact was unlocked by a provider payment.”
