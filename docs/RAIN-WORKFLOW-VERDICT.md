# Rain workflow verdict

**Checked:** August 9, 2026
**Decision:** no-go for a claimed end-to-end Rain spend.

The target `fund -> issue -> authorize -> settle -> exact readback` is coherent
only when each mutation has its own durable claim and every dependent step
waits for the precise evidence it needs. SpendForge proved more of that chain,
but the observed settlement response/readback sequence remained ambiguous.

## Current claim contract

| Step | Established state | Allowed claim |
|---|---|---|
| Fund | Historical sandbox POST returned HTTP 202 `{success:boolean}` with no correlation; bounded list read found no candidate | Asynchronous acknowledgment observed; funding outcome unresolved |
| Issue | Fresh card POST succeeded; exact GET matched the same card/user as active and virtual | Card issuance/readback confirmed in Rain Sandbox; requested limit semantics remain bounded to recorded evidence |
| Authorize | Separate durable claim; Rain returned a schema-valid `authorized` response for 12 USD cents and an encrypted recovery reference was stored | Rain accepted a sandbox authorization request |
| Authorization readback | A later exact GET matched transaction/card/user/type/12-cent amount/currency/merchant/MCC/virtual card and an open status after case/outer-whitespace-only normalization | Causal pre-settlement record matched |
| Settle | Exactly one durable settlement claim and one POST; Rain returned HTTP 400 | Ambiguous submission; never retry automatically |
| Terminal readback | Three bounded exact GETs remained nonterminal | No completed spend or money-movement proof |

The final resume branch made **5 Rain calls**: one exact reconciliation GET, one
settlement POST, and three exact readbacks. Across the recorded card flow there
are **3 mutations** (card issue, authorize, settlement submission) and no new
funding call. All
temporary execution routes were removed and gates closed.

## Documentation versus observed sandbox

Rain's current public beta OpenAPI 3.0.3 / Issuing API 1.3.0 documents:

- collateral funding as HTTP 200 with a UUID `transactionId`;
- authorization as `POST /simulate/transactions/authorize` returning
  `authorized | declined | settled` plus a transaction ID;
- settlement as `POST /simulate/transactions/{transactionId}/settle`;
- direct issuing-transaction GET with a spend record whose terminal completed
  state is `spend.status=completed`.

Observed funding instead returned HTTP 202 `{success:boolean}` without a causal
identifier. The public docs do not document that body, a status endpoint,
idempotency-key lookup, or a reliable mapping to a downstream CollateralAdd
record. A success boolean alone is not funding proof.

The recording authorization response matched the documented high-level shape.
The subsequent spend record contained the expected structural fields, but live
API drift and the still-unresolved executor/readback boundary prevented an
authoritative causal match. SpendForge records this as ambiguity rather than
guessing.

Official sources:

- [Rain OpenAPI](https://rain-sandbox-trial.mintlify.site/openapi.json)
- [Quickstart](https://rain-sandbox-trial.mintlify.app/docs/quickstart)
- [Scoped cards](https://rain-sandbox-trial.mintlify.app/docs/scoped-cards)
- [Collateral funding](https://rain-sandbox-trial.mintlify.app/docs/simulating-transactions/collateral-funding)
- [Card authorization](https://rain-sandbox-trial.mintlify.app/docs/simulating-transactions/card-authorizations)
- [Settlement](https://rain-sandbox-trial.mintlify.app/docs/simulating-transactions/settlement)
- [Transaction readback](https://rain-sandbox-trial.mintlify.app/reference/transactions/get-a-transaction-by-its-id)
- [Interactive Playground](https://rain-sandbox-trial.mintlify.site/api-playground)

## Safe next sequence

Do not retry the recorded authorization or settlement. A future separately
authorized read-only reconciliation may GET only the encrypted recovered
transaction reference under a fresh durable read generation. It may promote
success only if the exact causal record reaches `spend.status=completed`; any
other result preserves the current ambiguous state and permits no mutation.

The Preview Postgres CAS journal, restricted runtime role, cumulative guard,
and AES-GCM recovery-envelope seam are built and tested. Public receipts strip
encrypted references. This is strong safety/build evidence; it does not turn
an authorization into settlement.
