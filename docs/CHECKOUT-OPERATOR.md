# Checkout Operator expansion path

SpendForge's proved demo stays focused on programmatic, machine-deliverable
microprocurement. A future `CheckoutOperator` adapter can cover merchants that
do not expose a purchase API, but it is a delegated-consent workflow rather
than a generic autonomous browser.

## Normalized contract

```text
inspect -> quote -> policyAuthorization -> submit -> receiptReadback
                                      \-> requiresHuman
```

The operator can be exposed as typed MCP tools and implemented with an approved
reseller/marketplace API, a merchant-specific connector, or an isolated
allowlisted browser/computer-use runner. MCP standardizes the tool boundary; it
does not bypass merchant controls.

A standing human mandate must record:

- allowlisted merchant domains and categories;
- per-transaction and cumulative integer caps;
- permitted purchase count and mandate expiry;
- recurring purchases disabled by default;
- the exact known terms version the human accepted;
- the permitted resource/delivery class; and
- whether final irreversible commit always requires fresh approval.

The agent may inspect, quote, create a cart, and fill routine fields within that
mandate. New or changed terms, CAPTCHA, login, 3DS, fraud challenge,
subscription/recurrence, or a final irreversible commit outside the standing
mandate must emit `requiresHuman`. A compact approval card shows merchant,
resource, amount, reason, policy context, expiry, and Review/Approve/Reject
state. Approval is idempotent, authenticated in a real deployment, journaled
before resume, and default-denied at expiry.

A one-time scoped Rain card can be presented only to an approved connector or
isolated runner. SpendForge must not decrypt or retain PAN/CVC. A human mandate
never authorizes bypassing CAPTCHA, anti-bot controls, fraud checks, login,
terms acceptance, or 3DS. The human completes the challenge or approval; the
agent may then resume only to capture delivery and receipt evidence.

Future notification transports can include Slack interactive messages and
signed, short-lived email links. They are delivery adapters for the same
approval event, not authorization by themselves. Tonight's demo sends no
external message and its Approval Inbox is deterministic fixture UI only.

## Preferred alternative

Use approved reseller or marketplace APIs whenever available. They provide a
more stable quote, authorization, idempotency, receipt, and delivery contract
than browser checkout and are a better fit for autonomous microprocurement.
