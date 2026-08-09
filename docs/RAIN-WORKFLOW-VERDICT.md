# Rain workflow verdict

**Checked:** August 9, 2026

**Decision:** one bounded Rain Sandbox card purchase is provider-confirmed as
completed. No production funds moved.

## Current claim contract

| Step | Established state | Allowed claim |
|---|---|---|
| Fund | Historical Sandbox POST returned HTTP 202 `{success:boolean}` without a correlation identifier | Asynchronous acknowledgment observed; that funding outcome remains unresolved |
| Issue | Fresh scoped-card POST succeeded; exact GET matched the same card/user as active and virtual | Rain issued and read back a Sandbox virtual card; the requested exact cap was not independently proven |
| Authorize | Rain returned a schema-valid authorization for 12 USD cents, Northstar Synthetic, MCC `5734` | Rain accepted the bounded Sandbox authorization |
| Settle | Fresh flow sent the observed Sandbox-required `{ "amount": 12 }` body; Rain returned HTTP 200 | Settlement response accepted for this simulated transaction |
| Terminal readback | Exact GET matched transaction, card, user, spend type, 12-cent amount, USD, merchant, MCC, and virtual card, with `spend.status=completed` | One completed simulated Rain Sandbox spend is proven |

[Download the public redacted receipt](https://spendforge.vercel.app/api/audit/receipts/audit_rain_northstar_completed_20260809_v1).

## What changed from the ambiguous attempt

An earlier independently claimed transaction sent the settlement request using
the published optional-body interpretation. Rain returned HTTP 400 and bounded
readbacks remained nonterminal. That settlement was never retried and remains
historical ambiguous evidence.

Observed Sandbox behavior later established that settlement required the exact
authorized amount in the JSON body and returned lowercase
`completionReason: "settlement"`. SpendForge changed its parser and request
contract narrowly, then used a fresh card, transaction, operation scope, and
idempotency generation. The successful transaction was promoted only after its
own exact direct readback reached `completed`.

## Safety and evidence boundary

- Every mutation was preceded by a durable compare-and-set claim and used a
  distinct operation-specific idempotency key.
- Provider references required for recovery were AES-GCM encrypted server-side;
  public evidence contains only masked references and value-free response
  shapes.
- PAN and CVC were neither decrypted nor stored.
- The public Production deployment has no provider credentials or mutation
  routes. Temporary protected-Preview execution surfaces were removed and all
  gates are closed.
- The completed spend does not resolve the historical funding acknowledgment or
  independently prove the requested card cap.

Official references used alongside observed Sandbox truth:

- [Rain OpenAPI](https://rain-sandbox-trial.mintlify.site/openapi.json)
- [Scoped cards](https://rain-sandbox-trial.mintlify.app/docs/scoped-cards)
- [Card authorization](https://rain-sandbox-trial.mintlify.app/docs/simulating-transactions/card-authorizations)
- [Settlement](https://rain-sandbox-trial.mintlify.app/docs/simulating-transactions/settlement)
- [Transaction readback](https://rain-sandbox-trial.mintlify.app/reference/transactions/get-a-transaction-by-its-id)
- [Interactive Playground](https://rain-sandbox-trial.mintlify.site/api-playground)
