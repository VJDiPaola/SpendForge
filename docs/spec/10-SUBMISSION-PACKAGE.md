# Submission and Supporting Materials

## Goal

Package SpendForge so judges can understand the product, verify the sponsor integrations, and remember the core idea even if the live demo is interrupted.

Supporting materials must extend the product proof. They must not compensate for an unproven integration by implying that a fixture is live.

## Required deliverables

| Deliverable | Proposed path | Purpose |
|---|---|---|
| Public deployed app | Vercel URL | Primary product and live mission |
| Public artifact route | `/artifacts/[artifactId]` | Tangible result produced by the agent |
| Redacted proof route | mission/ledger URL | Rain and Monad receipts plus delivery/evaluation evidence |
| README | `README.md` | What it does, architecture, stack, setup, team, truth labels |
| Architecture graphic | `docs/submission/architecture.png` | Explain boundaries in one image |
| Product one-pager | `docs/submission/one-pager.pdf` | Judges and sponsor-team handoff |
| Truth sheet | `docs/submission/whats-real.md` | Live, sandbox, testnet, seeded, and replay distinctions |
| Demo script | `docs/submission/demo-script.md` | 75-second narration and click choreography |
| Supercut video | public logged-out URL | Primary recorded demo |
| Local backup video | `output/demo/spendforge-demo.mp4` | Recovery if hosted video fails |
| Screenshots | `docs/submission/screenshots/` | Submission form, social, and backup deck |
| Three-slide fallback deck | `docs/submission/fallback-deck.pdf` | Pitch when live product cannot be shown |

These paths are targets for the build phase; their absence now is not a blocker to the specification package.

## One-page narrative

The one-pager should answer, in order:

1. **Problem:** agents can transact, but payment success does not prove a purchase was useful.
2. **Product:** SpendForge gives agents bounded missions and ties every receipt to delivery and outcome evidence.
3. **How it works:** mission mandate, cross-rail selection, Rain/x402 purchase, evidence, authority proposal.
4. **Why Rain:** existing-web resources through scoped stablecoin-backed cards and infrastructure controls.
5. **Why Monad:** agent-native resources through HTTP micropayments and fast testnet settlement.
6. **Proof:** one public artifact, one Rain readback, one Monad transaction reference, one decline, one block.
7. **Truth:** Rain sandbox, Monad testnet, synthetic resource inventory.

Avoid TAM slides, invented customer logos, unsupported savings, and production-security claims.

## Architecture graphic

The graphic should show three horizontal layers:

### Outcome layer - SpendForge

- mission;
- resource choice;
- delivery evidence;
- outcome evaluation;
- future-authority proposal.

### Payment layer - provider-owned

- Rain scoped card and money controls;
- Monad x402 facilitator and settlement.

### Resource layer

- legacy merchant asset;
- agent-native component;
- optional future compute/data/service providers.

Use arrows for actual data/payment flow and a bold boundary labeled `Provider enforcement remains authoritative`.

## Screenshot list

Capture at least these five clean screenshots after live verification:

1. Mission control room before execution.
2. Split timeline showing Monad and Rain settled states.
3. Declined GPU offer and blocked malicious offer.
4. Final Atlas artifact with purchased resources visible.
5. Expanded audit ledger with provider receipt and outcome evidence.

Capture at 1440x900 with no browser bookmarks, personal tabs, notifications, keys, or unrelated desktop content.

## Three-slide fallback deck

### Slide 1: Agents can spend. Can they prove it was worth it?

- one-line problem;
- mission screenshot;
- core thesis.

### Slide 2: Two rails, one outcome loop

- compact architecture;
- Rain card purchase;
- Monad x402 purchase;
- no duplicate infrastructure.

### Slide 3: Receipt to evidence to earned authority

- final artifact;
- proof ledger;
- decline/block;
- future-authority proposal.

Tangible proof must appear by slide 3. The deck is a fallback, not the primary demo.

## Supercut recording plan

### Preflight

- Install and sign in to the Windows app before the final hour.
- Grant screen, microphone, and optional camera permissions.
- Record at 1080p or higher.
- Turn off notifications and unrelated apps.
- Use one browser window at a fixed size and zoom.
- Warm the deployed routes and verify both public links in incognito.
- Have the 75-second script visible on a separate device or printed.

### Recording settings

- Screen or fixed-window capture.
- Camera optional; product should occupy most of the frame.
- Clean microphone input.
- Three-second countdown.
- Mouse tracking enabled only if it improves auto-edit without distracting trails.
- System audio off unless the product intentionally uses it.

### Editing

- Remove dead waits but do not reorder provider events into a false sequence.
- Use restrained zooms on transaction states and the final artifact.
- Add short chapters only if they do not consume visible space.
- Keep sponsor and environment labels readable.
- Do not cover receipt IDs or truth badges with captions.
- Export a local MP4 before relying on the share link.

### Video acceptance

- 60-90 seconds.
- Understandable without audio through captions and visible state.
- Rain and Monad are both in the causal path.
- `Rain sandbox` and `Monad testnet` are spoken and visible.
- One decline and one block are visible.
- Final artifact and outcome evidence are visible.
- Shared video opens while logged out.

## Live demo checklist

- [ ] Production deployment loaded and warmed.
- [ ] Integration-health indicator green for required rails.
- [ ] Dedicated demo mission reset to ready state.
- [ ] Testnet wallet has sufficient USDC and MON.
- [ ] Rain collateral/card state ready for the intended path.
- [ ] Browser zoom and window size fixed.
- [ ] Incognito public artifact opens.
- [ ] Verified replay available but not silently enabled.
- [ ] Local backup video queued.
- [ ] Architecture slide and truth sheet available offline.

## Truth sheet template

| Element | Environment | What is real | What is seeded or simulated |
|---|---|---|---|
| Rain scoped-card flow | Workshop sandbox | API request sequence and provider readback | No production funds; merchant/resource inventory is synthetic |
| Monad x402 | Testnet | Payment negotiation, signature, facilitator/chain receipt, resource delivery | Test tokens and demo supplier |
| Resource catalog | Demo data | Validated manifests and actual delivery/use | Sellers, prices, and licenses are synthetic unless otherwise noted |
| Artifact | Deployed Vercel app | Persisted composition and public route | Atlas is a synthetic company/product |
| Evaluation | Deployed app and Playwright | Deterministic checks and recorded results | No customer outcome or revenue claim |
| Authority | SpendForge proposal | Proposal generated from evidence | Not automatically applied to Rain |

## README requirements before submission

- Product one-liner and 30-second explanation.
- Screenshot or short GIF.
- Architecture and provider boundaries.
- Exact Rain and Monad usage.
- Truth labels.
- Local setup and environment-variable names without values.
- Test commands and verified results.
- Deployed URL and public artifact.
- Demo video link.
- Team members and roles, once confirmed.
- All sponsor-resource links required by `09-RESOURCE-CATALOG.md`.

## Submission claim rules

Allowed after proof:

- `The agent completed a Rain workshop sandbox transaction and reconciled it by provider readback.`
- `The agent purchased a resource over x402 on Monad testnet.`
- `The delivered resources were used in the deployed artifact.`

Not allowed:

- `Real money moved` for the workshop sandbox/testnet demo.
- `Production-ready financial infrastructure` without a production security review.
- `Rain verified the outcome` or `Monad approved the purchase decision`.
- `Self-improving financial agent` when P0 only proposes a future limit.
- Any invented customer, revenue, adoption, or time-savings claim.

## Final 90-minute protection window

1. Freeze features.
2. Capture or refresh one verified live run.
3. Record Supercut video before README polish.
4. Export local backup.
5. Verify video, app, artifact, and proof links logged out.
6. Finish submission text and sponsor-tool checkboxes.
7. Run final build/test commands.
8. Push final commit and confirm repository visibility requirements.
