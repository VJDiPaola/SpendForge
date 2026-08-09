# SpendForge judged demo script

**Target:** 75–80 seconds
**Status:** Recording-ready script; no video has been recorded or published.
**Truth gate:** The build has one durable live OpenAI proposal, a complete
labeled fixture walkthrough, a proven Preview-only operation journal, and
partial Rain Sandbox evidence. Rain issued and read back a fresh active virtual
card, then accepted a 12-USD-cent authorization. A later exact GET matched the
causal fields; one settlement POST returned HTTP 400 and three bounded readbacks
remained nonterminal. No retry or completed-spend claim is permitted. Historical
funding remains an uncorrelated HTTP 202 acknowledgment. Monad `/supported`
passed read-only; no testnet payment occurred.

## Click and narration track

| Time | Screen and action | Narration |
|---:|---|---|
| 0–8s | `/` — hold on the scope and proof posture | “SpendForge lets agents procure small, preapproved digital resources—APIs, datasets, compute, and licenses—inside a human-set mandate.” |
| 8–20s | Open `/ledger#live-agent-decision-evidence`; expand the model receipt | “This is one actual bounded OpenAI proposal: Pulse, one-cent maximum, strict structured output. Deterministic policy rechecked the quote, vendor, evidence, and budget; the model never received a payment tool.” |
| 20–34s | Open `/missions/atlas-launch-v1`; click **Run mission** | “The recording-safe mission is a labeled fixture. It shows the full decision contract: one useful resource selected, a lower-fit option declined, and unsafe or over-budget offers blocked before payment.” |
| 34–50s | Open **Rain safe-stop evidence** | “On Rain Sandbox, SpendForge issued a fresh scoped card and direct readback matched it as active and virtual. Rain then accepted a 12-cent authorization.” |
| 50–63s | Open `/ledger#rain-provider-evidence` and the Rain receipt | “An exact read matched every causal field. We submitted settlement once; Rain returned 400 and three readbacks stayed pending, so the ledger freezes it as ambiguous. No retry, no spend claim.” |
| 63–71s | Point to Monad and fixture delivery states | “Monad's live read-only capability check passed, but wallet and test-asset configuration is absent. No payment or paid delivery is claimed.” |
| 71–78s | Open the artifact proof strip | “The result is an auditable microprocurement loop with progressive disclosure and a credible safe fallback when a provider drifts.” |

## Required visible and spoken labels

- Say and show `Rain Sandbox`.
- Say and show `Monad Testnet` while stating that payment remains unproven.
- Say `one live bounded model proposal` and show its durable receipt.
- Say `fixture walkthrough` before starting the animated mission.
- Keep `Synthetic mission` and the artifact truth bar visible.
- Say `authorization accepted; settlement blocked`, not `transaction completed`.
- Never say “money moved,” “funding completed,” “cap verified,”
  “settled,” or “both rails are live.”

## Product scope line

SpendForge is for low-value, preapproved, machine-deliverable purchases. It is
not a replacement for negotiated contracts, legal/tax review, vendor
onboarding, enterprise seats, renewals, or cancellations. Northstar is a
synthetic programmatic merchant whose licensing API returns a versioned digital
asset manifest; no browser checkout is claimed.

## Safe interruption branch

If a provider is unavailable, open the matching labeled failure view, explain
the frozen dependent action, and use the fixture walkthrough. A fixture is not
a verified replay. For non-API merchants, describe the future authenticated
`requiresHuman` handoff in [Checkout Operator](./CHECKOUT-OPERATOR.md); do not
imply that MCP bypasses CAPTCHA, 3DS, fraud checks, login, or terms acceptance.
