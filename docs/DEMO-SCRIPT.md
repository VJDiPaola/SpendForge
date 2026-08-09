# SpendForge judged demo script

**Target:** 70-75 seconds

**Status:** Recording-ready script; no video is claimed as published.

**Truth gate:** one live bounded OpenAI proposal, one completed simulated Rain
Sandbox spend with exact readback, a guided fixture walkthrough, and a read-only
Monad capability check. No Monad payment occurred.

## Click and narration track

| Time | Screen and action | Narration |
|---:|---|---|
| 0-8s | `/` - hold on the category and proof posture | "SpendForge is autonomous microprocurement for APIs, datasets, compute, and licenses inside a human-set mandate." |
| 8-19s | Click **View live decision** and expand the model receipt | "This is one actual bounded OpenAI proposal: Pulse at a one-cent maximum. Deterministic policy rechecked quote, vendor, evidence, and budget; the model never received a payment tool." |
| 19-34s | Open `/missions/atlas-launch-v1`; click **Run guided demo** | "The public mission is a safe guided walkthrough of the combined contract: the agent selects a useful resource, declines a weaker fit, and policy blocks unsafe or over-budget offers before payment." |
| 34-48s | Open the Rain proof | "Rain issued a single-purpose virtual card for a separate 12-cent Sandbox purchase, then accepted authorization and settlement." |
| 48-61s | Open `/ledger#rain-provider-evidence`; download the receipt | "Exact direct readback returned completed with matching card, user, merchant, MCC, amount, currency, and spend type. SpendForge closes the ledger only on that provider record." |
| 61-68s | Point to the Monad state | "The x402 v2 buyer and seller path is implemented and contract-tested. Its read-only capability check passed, but no live Monad payment is claimed." |
| 68-75s | Return to the proof posture | "The agent decides. Policy constrains it. Rain executes the payment. SpendForge proves the result." |

## Required visible and spoken labels

- Say and show `Rain Sandbox`.
- Say and show `Monad Testnet` while stating that payment remains unproven.
- Say `one live bounded model proposal` and show its durable receipt.
- Say `guided fixture walkthrough` before starting the animated mission.
- Keep `Synthetic mission` and the artifact truth bar visible.
- Say `completed simulated Rain Sandbox spend` while the completed receipt is
  visible.
- Never say `production funds moved`, `funding completed`, `cap verified`, or
  `both rails are live`.

The live OpenAI proposal and completed Rain purchase are separately proven
boundaries; do not narrate them as one canonical live run.

## Product scope

SpendForge is for low-value, preapproved, machine-deliverable purchases. It is
not a replacement for negotiated contracts, legal or tax review, vendor
onboarding, enterprise seats, renewals, or cancellations. Northstar is a
synthetic programmatic merchant whose API returns a versioned digital asset
manifest; no browser checkout is claimed.

## Safe interruption branch

If a provider is unavailable, use the labeled fixture walkthrough and explain
the frozen dependent action. A fixture is not a verified replay. For non-API
merchants, describe the future authenticated `requiresHuman` handoff in
[Checkout Operator](./CHECKOUT-OPERATOR.md); MCP does not bypass CAPTCHA, 3DS,
fraud checks, login, or terms acceptance.
