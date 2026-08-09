# Truth boundaries

What SpendForge has actually proven, and what it has not. This document exists
so the README can stay short without the project overstating itself.

The rule the codebase follows: a provider response is not proof. A Rain spend
is not marked `completed` until a direct `GET` on the transaction returns the
expected terminal record with the expected card, user, amount, currency,
merchant, MCC, and type. Provider acknowledgment alone is never authoritative.

## Surfaces

| Surface | Current truth |
|---|---|
| Public Production | Guided fixture mission; non-mutating; no provider credentials |
| OpenAI evidence | One live bounded proposal, separately policy-verified; execution surface removed |
| Rain evidence | Completed simulated 12-cent Sandbox spend with exact terminal readback; historical funding acknowledgment remains uncorrelated |
| Monad evidence | Official-package and fake-contract implementation plus one read-only capability check; no wallet, payment, chain receipt, or paid delivery |
| Guided artifact | Real deterministic application behavior using labeled fixture manifests; not causally unlocked by the live Rain purchase |
| Persistence | Provider-operation CAS journal proven on protected Preview; full mission/model/delivery/artifact state is not yet one canonical database graph |

## Evidence detail

| Evidence | Verified result | Inspect |
|---|---|---|
| Bounded model decision | One live OpenAI Responses call produced a strict purchase proposal; no tools or retries were enabled. | [Decision contract](./OPENAI-DECISION.md) |
| Deterministic policy | Typed code independently rechecked quote, cap, vendor, rail, provenance, license, delivery type, self-dealing, MCC, evidence, duplicate state, and prompt-injection risk. The model has no payment authority. | [`verifyPurchaseProposal`](../src/lib/decision/policy.ts), [policy tests](../tests/unit/decision-policy.test.ts) |
| Completed Rain Sandbox spend | Rain issued a scoped virtual card, accepted a 12-cent authorization and settlement, and exact transaction readback returned `spend.status=completed` with the expected card, user, amount, currency, merchant, MCC, and type. No production funds moved. | [Receipt builder](../src/lib/operations/rain-sandbox.ts) |
| Durable operation evidence | A Preview-only Postgres journal uses append-only records and compare-and-set duplicate claims; its runtime role is limited to `SELECT` and `INSERT`. | [Migration](../migrations/001_provider_operation_journal.sql), [setup](./DURABLE-JOURNAL-SETUP.md) |
| Downloadable audit receipts | Public receipts contain masked references, value-free response shapes, evidence codes, and authoritative readback state — never PAN, CVC, keys, or recovery plaintext. | [Receipt route](../src/app/api/audit/receipts/%5BreceiptId%5D/route.ts), [security model](../SECURITY.md) |
| Receipt integrity | Every served receipt carries a detached HMAC-SHA256 signature over its own contents, checkable with `npm run verify:receipt`. Signed with a **published** demo key by default, so this proves the bytes are unedited — it does **not** prove authorship. | [Signature module](../src/lib/operations/receipt-signature.ts), [tests](../tests/unit/receipt-signature.test.ts) |
| Monad/x402 boundary | Adapters, caps, durable attempt gates, and fake contract tests are implemented. A read-only `/supported` check passed; **no live Monad payment is claimed.** | [Status](../src/experimental/README.md), [preflight](./MONAD-X402-PREFLIGHT.md) |

## Two separate proofs, deliberately not merged

The live model proposal selected Pulse at one cent. The completed Rain proof was
a separate, bounded Northstar sandbox purchase at 12 cents. Both are genuine
proofs of their respective boundaries, and they are not presented as one
continuous run, because they were not one.

The guided mission demonstrates the combined product contract end to end using
labeled fixture manifests. It is real deterministic application behavior — the
same policy engine, the same journal semantics — but the artifact it produces is
not causally unlocked by the live Rain purchase.

Merging the two into a single claimed run would have made a better demo and a
worse record. The separation stays.

## Why the public deployment is fixture-only

The live provider surfaces carried credentials and one-shot mutation gates. They
ran on a protected Preview deployment and were removed after use, so the public
Production deployment has no provider credentials and no mutation surface at
all. What a visitor clicks cannot spend money, which is the correct posture for
a public link and the reason the demo is guided rather than live.

The cost is real and worth stating plainly: a reviewer clicking the public link
sees a deterministic replay, not a fresh purchase. The receipts and journal
records from the live runs are published as artifacts instead.
