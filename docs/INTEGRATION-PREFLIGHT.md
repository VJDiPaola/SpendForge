# Provider integration preflight

> **Historical pre-completion record.** This document preserves the provider
> preflight and the earlier ambiguous Rain attempt. A later independent bounded
> flow reached exact `spend.status=completed`; see
> [Rain workflow verdict](./RAIN-WORKFLOW-VERDICT.md) and the
> [completed public receipt](https://spendforge.vercel.app/api/audit/receipts/audit_rain_northstar_completed_20260809_v1).

**Checked:** August 9, 2026

A configured environment is not provider proof. Every provider write requires
a Preview-only gate, durable pre-call claim, integer cap, unique idempotency
generation, encrypted recovery reference when needed, and authoritative
readback. The final recording build exposes no provider execution route.

## Rain Sandbox

Server-only configuration names:

- `RAIN_BASE_URL` (exact allowlisted sandbox `/v1` origin)
- `RAIN_API_KEY`
- `RAIN_USER_ID`
- `RAIN_CONTRACT_ID`
- `DATABASE_URL`
- `RECOVERY_ENCRYPTION_KEY`

`RAIN_TEAM_ID` is optional for list reads. `RAIN_SESSION_ID` must not be
configured: scoped-card code creates the encrypted `sessionid` per request from
Rain's published RSA-OAEP/SHA-1 flow, zeroes the source secret, and never
decrypts/stores PAN or CVC.

Recording-build result:

1. durable claim for fresh scoped-card issuance;
2. card POST requested 12 USDC cents, MCC `5734`, and a short expiry;
3. encrypted raw card reference persisted server-side; public evidence received
   only a masked reference and value-free response shape;
4. exact card GET matched card/user and active virtual status;
5. separate durable claim for 12-USD-cent authorization at synthetic merchant
   `Northstar Synthetic`, MCC `5734`;
6. authorization response validated as `authorized`; encrypted transaction
   reference persisted;
7. a later direct transaction GET matched every causal field after only case and
   outer-whitespace normalization of merchant/currency;
8. one durably claimed settlement POST returned HTTP 400, then three exact GETs
   remained nonterminal. The settlement outcome is ambiguous and cannot retry.

The final resume branch made five Rain calls: one reconciliation GET, one
settlement POST, and three exact readbacks. Across the recorded card flow there
are three mutations (issue, authorize, settle submission) and no new funding
call. Historical funding remains HTTP 202 `{success:boolean}` without causal
correlation.

The exact completed-spend contract is unchanged: transaction, card, user,
amount 12 USD cents, merchant, MCC, virtual card, and terminal
`spend.status=completed` must all match direct readback. Authorization acceptance
alone is not settlement.

The bounded execution routes were removed after use. Rain fetches fail on
redirect, secrets remain server-only, encrypted recovery envelopes are removed
from downloadable receipts, and all mutation switches are closed.

Official references:

- [Rain OpenAPI](https://rain-sandbox-trial.mintlify.site/openapi.json)
- [Quickstart](https://rain-sandbox-trial.mintlify.app/docs/quickstart)
- [Scoped cards](https://rain-sandbox-trial.mintlify.app/docs/scoped-cards)
- [Session generation](https://rain-sandbox-trial.mintlify.app/docs/using-encryption-outside-of-a-browser-environment)
- [Authorization](https://rain-sandbox-trial.mintlify.app/docs/simulating-transactions/card-authorizations)
- [Settlement](https://rain-sandbox-trial.mintlify.app/docs/simulating-transactions/settlement)
- [Transaction readback](https://rain-sandbox-trial.mintlify.app/reference/transactions/get-a-transaction-by-its-id)

See [Rain workflow verdict](./RAIN-WORKFLOW-VERDICT.md) for the documented HTTP
200 funding response versus observed HTTP 202 conflict.

## Monad Testnet / x402

The official v2 packages are pinned and fake contract tests cover buyer/seller
selection, durable duplicate gating, unknown post-sign outcomes, settlement
decoding, chain-receipt checks, and separate delivery validation. One live
read-only facilitator `/supported` call advertised v2 `exact` on
`eip155:10143`; no RPC, wallet, payment, settlement, or paid delivery occurred.

Preview names required before a future preflight:

- `MONAD_X402_PAYMENT_ENABLED`
- `MONAD_X402_SELLER_ENABLED`
- `MONAD_X402_RESOURCE_URL`
- `MONAD_X402_SELLER_ADDRESS`
- `MONAD_X402_AUTHORIZED_ATTEMPT_ID`
- `MONAD_X402_MAX_AMOUNT_ATOMIC`
- `MONAD_X402_BUYER_PRIVATE_KEY`
- `VERCEL_AUTOMATION_BYPASS_SECRET`
- `MONAD_RPC_URL`

The protected seller, authenticated self-fetch seam, seller journal, run-wide
cap, encrypted transaction recovery, and exact chain-receipt verifier are built
and fake-tested. Preview wallet/seller/test-asset variables are absent, so live
payment remains fail-closed. See [Monad x402 preflight](./MONAD-X402-PREFLIGHT.md).

## Model decision

One protected Preview call used `gpt-5.6-terra`, strict Responses structured
output, 600 maximum output tokens, `store:false`, no tools, and no retry. The
durable record contains model/prompt versions, input/output digests, safe
structured output, 1,617-token usage, deterministic policy verification,
timestamps, and a masked response reference. The execution route was removed;
the adapter remains disabled without a fresh explicit authorization.

## Durable journal

The Preview-only Neon migration, restricted `SELECT`/`INSERT` runtime role,
append-only trigger, atomic CAS winner, duplicate barrier, and cross-connection
persistence are proven. The operation journal now carries live model and Rain
attempt evidence. It does not yet make the entire mission/delivery/artifact graph
canonical or provide a database-reserved run-wide cumulative balance.
