# UX and Demo Specification

## Experience goal

SpendForge should look like a deployed financial-operations product with agent activity inside it, not a chat demo with payment logos attached. The user should understand the mission, mandate, purchases, provider states, and outcome without reading narration.

## Information architecture

| Route | Purpose | P0 |
|---|---|---:|
| `/` | Product landing and direct link to the showcase mission | Yes |
| `/missions` | Mission list with status, spend, and outcome | Yes |
| `/missions/[missionId]` | Mission control room and live run timeline | Yes |
| `/catalog` | Normalized resource offers and native rails | Yes |
| `/ledger` | Cross-rail transaction and evidence ledger | Yes |
| `/policies` | Read-only view of operator mandate and provider enforcement | Yes |
| `/artifacts/[artifactId]` | Public generated artifact and proof summary | Yes |
| `/settings/integrations` | Redacted integration health | Optional |

No authentication wall should block the public showcase. Mutating controls may use a simple demo-admin gate, but the completed mission, artifact, and redacted ledger must be viewable in incognito mode.

## Navigation

Desktop navigation uses a narrow left rail:

- SpendForge mark
- Missions
- Resource catalog
- Ledger
- Policies
- bottom environment block: `Rain Sandbox`, `Monad Testnet`

The top bar contains the synthetic workspace name, deployment environment, and an integration-health indicator. Do not display sponsor logos as the primary navigation.

## Design system

### Visual language

- **Product character:** precise, calm, operational, premium.
- **Layout:** dense enough to feel real, with generous whitespace around decisive information.
- **Primary background:** paper `#F5F6F7`.
- **Surface:** white `#FFFFFF`.
- **Ink:** `#111318`.
- **Muted text:** `#69707D`.
- **Forge green:** `#27C98B` for successful evidence.
- **Decision amber:** `#E6A23C` for review or reconciliation.
- **Block red:** `#D84A4A` for hard stops.
- **Rain rail accent:** pink used only on Rain badges and timeline events.
- **Monad rail accent:** purple used only on Monad badges and timeline events.
- **Typography:** Geist Sans with Geist Mono for IDs, amounts, and timestamps.
- **Radius:** 12px surfaces, 8px controls.
- **Motion:** short state transitions; no decorative particles, fake blockchain rain, or endless spinners.

All text and state colors must pass WCAG AA contrast. Never communicate a payment state by color alone.

## Screen specifications

### 1. Landing page

The first viewport must establish the product in under five seconds.

**Headline:** `Give agents a budget. Make every purchase prove itself.`

**Subhead:** `SpendForge routes agent purchases across card and x402 rails, then ties every receipt to delivery and outcome evidence.`

Primary CTA: `Open the live mission`
Secondary CTA: `View architecture`

Below the fold, show the four-step loop: Mission, Buy, Prove, Earn.

### 2. Missions list

Show three synthetic records so the platform feels inhabited, but only one can be run:

- `Atlas launch page` - ready
- `Regression test acquisition` - sample complete
- `Supplier recovery` - template

Synthetic/sample labels must remain visible.

Columns: status, budget, spent, purchased resources, outcome score, environment, updated time.

### 3. Mission control room

This is the primary demo screen. Use a three-zone layout:

1. **Mission and mandate header:** objective, budget, cap, deadline, permitted resource types, environments.
2. **Live work area:** artifact preview on the left; event timeline on the right.
3. **Evidence tray:** purchases, provider receipts, delivery hashes, checks, and future-authority proposal.

Primary control: `Run mission`. One click starts bounded autonomous execution.

Do not add an approval modal for purchases already inside the mandate. A blocked or escalated purchase appears as an event with an explicit reason.

Recommended stable test hooks:

- `data-testid="run-mission"`
- `data-testid="environment-rain"`
- `data-testid="environment-monad"`
- `data-testid="decision-timeline"`
- `data-testid="artifact-preview"`
- `data-testid="ledger-row-rain"`
- `data-testid="ledger-row-x402"`
- `data-testid="authority-proposal"`

### 4. Resource catalog

Each resource card shows:

- seller and synthetic/verified status;
- resource type;
- native checkout rail;
- price and asset;
- delivery type;
- provenance and license;
- trust signals;
- current availability;
- whether it is eligible under the active mission.

Do not present Rain and x402 as interchangeable currencies. The rail is an attribute of the seller's checkout method.

### 5. Ledger

The ledger is the trust center of the demo.

Columns:

- timestamp;
- mission;
- resource;
- rail/environment;
- amount;
- decision;
- provider state;
- delivery state;
- outcome contribution;
- receipt.

Expanding a row shows a structured decision summary, idempotency key suffix, redacted provider identifiers, resource hash, and reconciliation history. Never show secrets, PAN data, complete private addresses where unnecessary, or raw model output.

### 6. Policies

Separate two concepts visually:

- **Mission mandate:** SpendForge's stricter objective-level constraints.
- **Provider enforcement:** controls enforced by Rain or the x402/wallet stack.

Use copy such as: `SpendForge decides whether this mission should buy. Rain decides whether this card transaction may execute.`

### 7. Public artifact

The generated Atlas page is a real route backed by persisted resource manifests. It includes:

- the purchased Northstar background;
- the purchased Pulse component pack;
- the required hero, capabilities, evidence, and CTA;
- a small `Built by a synthetic SpendForge mission` disclosure;
- a `View proof` link back to the redacted mission ledger.

## State language

Use these exact user-facing states:

| Internal state | UI label |
|---|---|
| `proposed` | Proposed |
| `policy_checked` | Within mandate |
| `blocked` | Blocked by mandate |
| `declined` | Declined by agent |
| `payment_pending` | Payment pending |
| `authorized` | Authorized |
| `settlement_pending` | Settlement pending |
| `settled` | Settled |
| `delivery_pending` | Awaiting resource |
| `delivered` | Resource delivered |
| `reconciliation_required` | Needs reconciliation |
| `evaluated` | Outcome verified |
| `completed` | Mission complete |

An optimistic animation may never advance the stored provider state.

## Decision-summary format

Display four structured fields:

- `Why considered`
- `Why permitted or declined`
- `Expected contribution`
- `Evidence required`

Example:

> **Why considered:** Supplies a licensed hero background required by the mission.
> **Why permitted:** Known seller, `$0.12` is below the `$0.15` per-purchase cap.
> **Expected contribution:** Improves visual fit while preserving the component budget.
> **Evidence required:** Rain settlement readback, asset hash, and rendered usage.

## Demo choreography

Target length: 75 seconds. Record at 1440x900 or 1920x1080 with browser zoom locked before the take.

| Time | Visual | Spoken point |
|---:|---|---|
| 0-8s | Mission control header and mandate | Agents can spend, but payment alone does not prove the spend was useful. |
| 8-18s | Resource catalog and one-click Run | This agent has one mission and a `$0.25` bounded budget. |
| 18-32s | x402 402, payment, and delivery events | It buys an agent-native component over Monad x402. |
| 32-48s | Rain scoped-card, authorization, settlement, readback | It uses Rain for a legacy merchant resource under infrastructure controls. |
| 48-57s | GPU option declined and malicious template blocked | It declines waste and blocks an untrusted bargain. |
| 57-67s | Artifact preview transforms | The purchased resources materially change the result. |
| 67-75s | Ledger and authority proposal | Receipts become evidence, and evidence can justify more authority. |

The narration must say `Rain sandbox` and `Monad testnet` at least once.

## Demo failure handling

- If a live provider step takes longer than three seconds, show a truthful waiting state and continue narration.
- If it exceeds the function deadline, transition to `Needs reconciliation`; never jump to success.
- A replay can be selected before recording, but the environment header must say `Verified run replay`.
- Keep the public artifact and a redacted completed ledger available even if a provider is down.

## What makes it look like a real platform

- Durable URLs for missions, receipts, and artifacts.
- Refresh-safe state.
- Multiple views over the same canonical data.
- Empty, loading, error, and reconciliation states.
- Redacted integration health.
- Exact timestamps and provider identifiers.
- Responsive behavior and accessible controls.
- Honest environment labels and source provenance.

Avoid fake charts, invented savings, random activity feeds, placeholder lorem ipsum, and decorative wallet balances.
