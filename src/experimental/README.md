# Experimental

Code in this directory is implemented and tested but has **not** been proven
end to end against a live provider. It is kept because it is real work with
real test coverage, and separated because a reviewer should not have to guess
which parts of SpendForge have moved money and which have not.

Nothing here is imported by `src/lib/integrations`. The main integration
surface exports Rain only.

## `x402/`

An x402 v2 buyer and seller implementation for Monad Testnet, built on the
official `@x402/*` packages: buyer and seller adapters, payment requirement
construction, signature verification, spend caps, a durable attempt gate, RPC
access, and fake-contract tests.

**What is proven:** the adapters satisfy their contract tests, and a read-only
`/supported` call against the facilitator confirmed x402 v2 `exact` on Monad
Testnet.

**What is not proven:** no wallet was funded, no payment was signed, no
facilitator settlement occurred, and no chain receipt exists. No paid delivery
has ever been attributed to an x402 payment. The `monad_x402` rail that appears
in the guided mission is a labeled fixture and says so in its own truth label.

To finish this rail, the missing pieces are a funded Monad Testnet buyer
wallet, a test asset, and a settlement run that produces a chain receipt the
journal can read back — the same authoritative-readback standard the Rain path
already meets. Until that exists, this stays here.
