# API and Data Contracts

## Contract principles

1. Provider payloads stay inside provider adapters.
2. Domain types contain normalized, redacted data.
3. Monetary values use integer minor units and explicit decimals.
4. Payment, delivery, and outcome are separate state machines.
5. All inputs and provider responses are runtime-validated.
6. Every mutation carries an idempotency key.
7. Exact Rain schemas remain provisional until the workshop playground is inspected.

## Core scalar types

```ts
type Id = string;
type ISODateTime = string;
type HexAddress = `0x${string}`;

type Money = {
  amount: string;      // integer atomic/minor units, never a decimal float
  decimals: number;    // 2 for sandbox USD cents, 6 for USDC
  asset: "USD" | "rUSD" | "USDC";
  network?: "rain-sandbox" | "eip155:10143";
};
```

Formatting functions may produce `$0.12` or `0.003 USDC`, but arithmetic operates on the integer `amount` string.

## Mission and mandate

```ts
type Mission = {
  id: Id;
  title: string;
  objective: string;
  status: MissionStatus;
  templateKey: "atlas-launch-v1";
  mandateId: Id;
  successCriteria: SuccessCriterion[];
  synthetic: true;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

type Mandate = {
  id: Id;
  totalBudget: Money;
  perPurchaseCap: Money;
  authorityCeiling: Money;
  allowedResourceTypes: ResourceType[];
  allowedSellerIds: Id[];
  allowedRails: PaymentRail[];
  minimumProvenance: "seeded" | "signed" | "verified";
  deadline: ISODateTime;
  version: number;
};
```

`authorityCeiling` is human-set and immutable during a run.

## Resource offer

```ts
type ResourceType =
  | "data"
  | "component"
  | "media"
  | "compute"
  | "service"
  | "product";

type PaymentRail = "free" | "rain_card" | "monad_x402";

type ResourceOffer = {
  id: Id;
  version: number;
  sellerId: Id;
  sellerDisplayName: string;
  title: string;
  description: string;
  type: ResourceType;
  rail: PaymentRail;
  price: Money;
  deliveryType: "manifest" | "asset" | "json" | "compute_job";
  provenance: "seeded" | "signed" | "verified";
  synthetic: boolean;
  license: {
    label: string;
    usage: "demo-only" | "permissive" | "commercial";
    sourceUrl?: string;
  };
  contentHash?: string;
  active: boolean;
};
```

## Model proposal and policy result

```ts
type PurchaseAction = "buy" | "decline" | "block" | "escalate";

type PurchaseDecision = {
  offerId: Id;
  action: PurchaseAction;
  confidenceBps: number; // 0-10000
  expectedContribution: string;
  evidenceRequired: string[];
  summary: {
    whyConsidered: string;
    whyAction: string;
  };
};

type PolicyResult = {
  eligible: boolean;
  disposition: "allowed" | "blocked" | "escalate";
  ruleCodes: PolicyRuleCode[];
  committedSpendAfter?: Money;
  mandateVersion: number;
};
```

The model cannot set `PolicyResult`.

## Payment attempt

```ts
type PaymentProviderState =
  | "created"
  | "pending"
  | "authorized"
  | "settlement_pending"
  | "settled"
  | "declined"
  | "failed"
  | "unknown";

type PaymentAttempt = {
  id: Id;
  runId: Id;
  offerId: Id;
  rail: Exclude<PaymentRail, "free">;
  environment: "rain-sandbox" | "monad-testnet";
  amount: Money;
  providerState: PaymentProviderState;
  idempotencyKey: string;
  providerReference: string; // redacted where required
  transactionUrl?: string;
  lastReconciledAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};
```

`providerReference` must never contain PAN data, credentials, or a private key.

## Delivery and evaluation

```ts
type DeliveryEvidence = {
  id: Id;
  paymentAttemptId?: Id;
  offerId: Id;
  state: "pending" | "delivered" | "failed";
  contentHash?: string;
  manifestVersion?: number;
  storageRef?: string;
  deliveredAt?: ISODateTime;
  errorCode?: string;
};

type Artifact = {
  id: Id;
  runId: Id;
  slug: string;
  manifestVersion: number;
  resourceOfferVersions: Array<{ offerId: Id; version: number }>;
  public: boolean;
  createdAt: ISODateTime;
};

type Evaluation = {
  id: Id;
  artifactId: Id;
  evaluatorVersion: string;
  checks: EvaluationCheck[];
  passed: boolean;
  scoreBps: number;
  createdAt: ISODateTime;
};
```

## Authority proposal

```ts
type AutonomyProposal = {
  id: Id;
  runId: Id;
  currentPerPurchaseCap: Money;
  proposedPerPurchaseCap: Money;
  ceiling: Money;
  rationale: string[];
  state: "proposed" | "accepted_by_operator" | "rejected_by_operator";
  appliedToRain: false;
};
```

P0 never changes `appliedToRain` to true.

## Run state machine

```text
draft
  -> planning
  -> policy_checked
  -> purchasing
  -> delivering
  -> composing
  -> evaluating
  -> completed

Terminal or intervention branches:
  declined
  blocked
  failed
  reconciliation_required
```

Each purchase has its own payment and delivery state. A run may continue after one declined offer but must stop on a required-resource payment or delivery failure.

## Run events

```ts
type RunEventType =
  | "run.started"
  | "plan.created"
  | "offer.considered"
  | "offer.declined"
  | "offer.blocked"
  | "policy.passed"
  | "payment.started"
  | "payment.authorized"
  | "payment.settled"
  | "payment.reconciliation_required"
  | "resource.delivered"
  | "resource.delivery_failed"
  | "artifact.composed"
  | "evaluation.completed"
  | "authority.proposed"
  | "run.completed"
  | "run.failed";

type RunEvent = {
  sequence: number;
  runId: Id;
  type: RunEventType;
  occurredAt: ISODateTime;
  publicPayload: Record<string, unknown>;
};
```

Events are append-only. Corrections create new reconciliation events instead of rewriting history.

## Internal application endpoints

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/missions` or Server Action | Create showcase mission from validated template |
| `POST` | `/api/runs` or Server Action | Create an idempotent run record |
| `POST` | `/api/runs/[runId]/execute` | Execute and optionally stream persisted run events |
| `GET` | `/api/runs/[runId]` | Fetch canonical run, events, payments, deliveries, and evaluation |
| `POST` | `/api/runs/[runId]/reconcile` | Re-read non-terminal provider states |
| `GET` | `/api/resources/[resourceId]` | x402-protected demo supplier resource |
| `GET` | `/api/integrations/health` | Return redacted configuration and provider reachability |

All mutating endpoints validate origin, authorization, idempotency, and runtime schemas.

## RainGateway contract

```ts
interface RainGateway {
  fundCollateral(input: RainFundInput): Promise<RainCollateralReceipt>;
  issueScopedCard(input: RainScopedCardInput): Promise<RainCardReceipt>;
  authorize(input: RainAuthorizeInput): Promise<RainTransactionReceipt>;
  settle(input: RainSettleInput): Promise<RainTransactionReceipt>;
  readback(input: RainReadbackInput): Promise<RainTransactionReceipt>;
}
```

Endpoint names verified against current workshop documentation and observed
sandbox traffic:

| Method | Endpoint | Known fields only |
|---|---|---|
| `POST` | `/simulate/collateral/fund` | `contractId`, `currency`, `amount` |
| `POST` | `/issuing/users/{userId}/cards/scoped` | `amountInUSDCents`; requires `sessionid` header |
| `POST` | `/simulate/transactions/authorize` | `cardId`, `amount`, `currency`, `merchantName`, `merchantCategoryCode` |
| `POST` | `/simulate/transactions/{id}/settle` | Path `id`; body omitted to settle the authorized amount |
| `GET` | `/issuing/transactions/{transactionId}` | Exact transaction readback; spend status `completed` is terminal success |
| `POST` | `/payment-routes` | `userId`, `source`, `destination` |
| `POST` | `/simulate/payment-routes` | `paymentRouteId`, `amount` |

The Rain adapter uses the current published OpenAPI 3.0.3 / Issuing API 1.3.0 schemas. The scoped-card `sessionid` is generated ephemerally server-side from Rain's published sandbox RSA key; it is not an environment variable. SpendForge discards the secret and never decrypts or stores PAN/CVC for the simulator-only P0 flow.

## X402Gateway contract

```ts
interface X402Gateway {
  getSupported(): Promise<X402SupportedConfig>;
  payAndFetch<T>(input: {
    url: string;
    expectedSeller: HexAddress;
    maxAmount: Money;
    idempotencyKey: string;
    responseSchema: RuntimeSchema<T>;
  }): Promise<{
    receipt: X402PaymentReceipt;
    resource: T;
    contentHash: string;
  }>;
}
```

Implementation uses official x402 wrappers and Monad's facilitator. The application must not call `/verify` or `/settle` with hand-built payloads unless the installed official package explicitly requires a low-level client.

## Error contract

```ts
type AppError = {
  code:
    | "MANDATE_BLOCKED"
    | "LOW_CONFIDENCE"
    | "DUPLICATE_ATTEMPT"
    | "PROVIDER_DECLINED"
    | "PROVIDER_TIMEOUT"
    | "RECONCILIATION_REQUIRED"
    | "DELIVERY_FAILED"
    | "RESOURCE_SCHEMA_INVALID"
    | "SELF_DEALING_RISK"
    | "EVALUATION_FAILED"
    | "CONFIGURATION_MISSING";
  message: string;
  retryable: boolean;
  publicDetails?: Record<string, string>;
  providerDetailsRef?: string;
};
```

Provider error bodies are not passed through to the browser without redaction.

## Idempotency contract

Compute the logical idempotency key from:

```text
missionId + runId + offerId + rail + mandateVersion + attemptGeneration
```

- Repeating the same logical mutation returns the existing attempt.
- A deliberate new attempt increments `attemptGeneration` after reconciliation.
- Database uniqueness is the final duplicate barrier.
- If a provider supports native idempotency headers, pass a derived provider-safe key.

## Reconciliation contract

On timeout or ambiguous response:

1. Persist `unknown` or `reconciliation_required`.
2. Read authoritative provider state.
3. Match using the stored provider reference and safe correlation fields.
4. Retry only a missing action, never the entire sequence.
5. Append a reconciliation event.
6. Proceed to delivery only after a terminal settled result.

## Replay contract

```ts
type RunReplay = {
  schemaVersion: 1;
  sourceRunId: Id;
  capturedAt: ISODateTime;
  environment: "verified-live-sandbox-testnet";
  events: RunEvent[];
  payments: PaymentAttempt[];
  deliveries: DeliveryEvidence[];
  artifact: Artifact;
  evaluation: Evaluation;
  redacted: true;
};
```

Replay fixtures never contain provider secrets and never populate live database tables without an explicit `replay` flag.
