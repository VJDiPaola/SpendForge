# SpendForge judging map

**Purpose:** adversarial claim review, not promotional copy.

**Current snapshot:** one live bounded OpenAI proposal; deterministic policy;
durable Preview-only CAS journal; one completed Rain Sandbox scoped-card
purchase with exact direct readback; one read-only Monad `/supported` call and
zero Monad payment calls. The animated mission and artifact remain labeled
fixtures.

## Judge questions

| Question | Evidence-backed answer | Inspectable proof |
|---|---|---|
| Is the agent deciding? | **Yes, narrowly.** One protected Preview Responses call proposed Pulse from a fixed catalog with a one-cent maximum. Deterministic code independently verified quote, vendor, evidence, caps, duplicate state, and policy rules. | Live decision card and downloadable receipt in `/ledger`; model/prompt versions, digests, usage, structured output, and policy result. |
| Did money move? | **A simulated Rain Sandbox spend completed.** Rain accepted the 12-cent authorization and settlement; exact direct GET returned completed with all causal fields matched. No production funds moved. | Completed redacted Rain receipt with masked references, response shapes, and terminal readback predicates. |
| What uniquely did Rain enable? | Rain supplied the scoped virtual card, provider authorization, settlement, and authoritative transaction record. SpendForge supplied proposal, deterministic policy, durable attempt journal, and receipt. | Rain operation states, response shapes, readback predicates, and CAS evidence. |
| Can every claim be proved? | Each current provider/model claim is scoped to a downloadable redacted receipt. The full guided outcome is product evidence, not a causal live-payment graph. | Ledger truth labels, live decision receipt, completed Rain receipt, fixture receipt, artifact proof strip. |
| Is there a credible fallback? | Yes. The labeled fixture demonstrates the complete decision/policy/delivery/outcome contract without pretending to be live provider evidence. | Guided mission, deterministic tests, failure states, and backup script. |

## Why this is an agent rather than a chatbot

The model receives a fixed catalog, objective, quoted integer prices, policy
context, and prior evidence. It returns a strict proposal:
`APPROVE | REJECT | NEEDS_REVIEW`, selected resource, maximum cents, concise
rationale, evidence IDs, risks, and confidence. Deterministic code remains
execution authority. The autonomy is resource selection inside a standing
mandate, not unrestricted purchasing.

## Product-market boundary

Primary fit: low-value, preapproved, machine-deliverable resources such as API
access, dataset slices, model inference, compute, enrichment or verification,
OCR or transcription, test infrastructure, and sandbox time. Northstar is a
synthetic programmatic merchant whose API returns a licensed versioned asset
manifest.

SpendForge does not replace enterprise software procurement, negotiated
contracts, legal or tax review, vendor onboarding, seat lifecycle, renewals, or
cancellations. The future [Checkout Operator](./CHECKOUT-OPERATOR.md) uses
authenticated human handoff; it does not bypass merchant controls.

## Remaining gaps

1. **No live Monad payment proof.** Official x402 v2 adapters, a protected
   seller, durable gates, caps, and fake contracts exist; wallet funding,
   facilitator settlement, chain receipt, and causal paid delivery remain
   unproven.
2. **No canonical full-run graph.** Provider attempts are durable, but the live
   OpenAI proof, completed Rain proof, animated mission, delivery, and artifact
   are not one persisted causal run.
3. **Run-wide budget persistence is incomplete.** Per-attempt safeguards exist;
   a database-reserved balance across concurrent purchases remains future work.
4. **Historical Rain funding remains uncorrelated.** The observed HTTP 202
   `{success:boolean}` response conflicts with the published correlation
   contract. The completed card spend is independently proven.
5. **Observability can go further.** Receipts are strong, but a full run trace
   and provider worker/webhook reconciliation layer are not implemented.

## Claim filter

Allowed:

- "SpendForge is autonomous microprocurement inside a human-set mandate."
- "One bounded live OpenAI proposal selected Pulse; deterministic policy
  independently verified it."
- "Rain Sandbox completed a separate simulated 12-cent card purchase; exact
  direct readback matched every causal field."
- "The Preview append-only journal and duplicate barrier are proven."
- "Monad/x402 is implemented and contract-tested; no live payment is claimed."

Blocked:

- "The live OpenAI decision caused the completed Rain purchase."
- "Production or real funds moved."
- "Rain independently verified the requested exact card cap."
- "The agent paid over x402 on Monad Testnet."
- "Both rails are live."
- "The fixture artifact was unlocked by the provider payment."
