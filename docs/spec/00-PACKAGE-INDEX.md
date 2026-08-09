# SpendForge Specification Package

**Status:** Historical build-ready specification; implementation status is maintained in [README.md](../../README.md) and [DEMO-NOTES.md](../DEMO-NOTES.md)
**As of:** August 8, 2026
**Target:** Raingentic Commerce Hackathon NYC

## Decision summary

- Build **SpendForge**, an outcome-aware resource procurement platform for agents.
- Demonstrate a visually strong launch-artifact mission rather than requiring arbitrary code execution.
- Use Rain for a legacy/card resource and Monad x402 for an agent-native resource.
- Keep Rain and Monad authoritative for their respective controls and settlement.
- Deploy the platform on Vercel.
- Keep model, database, and optional execution-provider implementations behind adapters.
- Treat Daytona, Modal, Claude Code, Warp, and other tools as optional build/runtime choices, not sponsor checkboxes.
- Record the final walkthrough with Supercut after the live path is verified.

## Reading order

| Order | Document | Purpose |
|---:|---|---|
| 1 | [Product spec](./01-PRODUCT-SPEC.md) | Defines the product, user, P0 scope, and acceptance criteria |
| 2 | [Capability boundaries](./02-CAPABILITY-BOUNDARIES.md) | Prevents rebuilding Rain or Monad |
| 3 | [UX and demo](./03-UX-AND-DEMO.md) | Defines the actual platform experience and recorded story |
| 4 | [Behavior and autonomy](./04-BEHAVIOR-AND-AUTONOMY.md) | Defines what the agent may and may not do |
| 5 | [Technical architecture](./05-TECHNICAL-ARCHITECTURE.md) | Defines components, runtime, integrations, and security |
| 6 | [API and data contracts](./06-API-AND-DATA-CONTRACTS.md) | Defines states, entities, adapters, and endpoints |
| 7 | [Eval and test plan](./07-EVAL-AND-TEST-PLAN.md) | Defines proof and failure thresholds before code |
| 8 | [Build handoff](./08-BUILD-HANDOFF.md) | Divides implementation into bounded agent workstreams |
| 9 | [Official resource catalog](./09-RESOURCE-CATALOG.md) | Records current provider and implementation authorities |
| 10 | [Submission package](./10-SUBMISSION-PACKAGE.md) | Defines screenshots, diagrams, video, fallback, and final QA |

## Locked decisions

1. **No duplicate payment infrastructure.** SpendForge configures and consumes Rain and x402; it does not replace them.
2. **No arbitrary code execution in P0.** Vetted resource manifests can be composed safely without choosing a sandbox vendor.
3. **One-click bounded autonomy.** The operator sets the mandate once; permitted purchases execute without per-item approval.
4. **Provider truth beats local state.** A ledger entry is not settled until authoritative readback proves it.
5. **Earned authority is a proposal.** The agent may recommend a higher future limit but cannot change Rain controls or its own hard rules.
6. **Truthful demo labels.** Rain is sandbox, Monad is testnet, and seeded resources remain labeled.

## Decisions deferred to build preflight

- Decision-model provider and exact SDK version.
- Postgres provider available through the team's current accounts.
- Exact Rain request/response schemas beyond current official docs and observed sandbox variants.
- Exact installed x402 package versions, subject to the official v2 guide and current exports.
- Whether the x402 demo supplier is deployed in the same Vercel project or as a second small project.
- Optional execution provider for post-P0 compute missions.

Each deferred decision has a time-box and fallback in [the build handoff](./08-BUILD-HANDOFF.md).
