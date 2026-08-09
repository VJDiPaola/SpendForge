# Raingentic Commerce Hackathon Brief

## Event

- **Event:** Raingentic Commerce Hackathon NYC
- **Hosts:** Rain, Monad Foundation, Encode Club
- **Build window:** August 8-9, 2026
- **Submission deadline:** Sunday, August 9, 2026 at 12:00 PM America/New_York
- **Demo target:** 75 seconds recorded, plus a live walkthrough if requested
- **Presentation allotment:** Unconfirmed; verify with organizers before final editing
- **Owner:** Vince
- **Additional team members:** TBD

## Challenge fit

SpendForge targets all three published paths:

1. **Best use of Rain:** an agent issues and uses a scoped card through Rain's workshop infrastructure.
2. **General track:** the agent autonomously initiates and completes transactions within a mandate.
3. **Monad bounty:** an agent purchases an HTTP-delivered resource using x402 on Monad testnet.

## Product thesis

Agents should not receive an open-ended budget. They should buy only resources that advance a mission, attach proof of what the purchase accomplished, and earn any increase in authority through outcomes.

## Demo thesis

The showcase mission creates a polished launch artifact from purchased resources:

- one component or data resource delivered after a Monad x402 payment;
- one licensed visual resource delivered after a Rain sandbox transaction;
- one expensive or irrelevant resource deliberately declined;
- one over-budget purchase blocked;
- one deployable artifact whose checks demonstrate that the purchases mattered.

The mission uses sanitized, synthetic content. The payments and resource delivery are the focus, not an invented customer claim.

## Truth boundaries

- Rain workshop activity is sandbox simulation. No real money moves.
- Monad uses testnet USDC and testnet MON.
- Merchant inventory and resource metadata may be seeded.
- A seeded resource can still be genuinely delivered and used by the artifact.
- Optional compute providers are not part of P0 unless their live integration is proven.
- `fixture` mode is an offline fallback, never evidence of live integration.

## Deployment

- **Primary host:** Vercel
- **Framework:** Next.js App Router
- **First deployment gate:** hello-world deployment before payment integration work
- **Recording:** Supercut on Windows, with a local backup recording

## Definition of a successful hackathon build

- The deployed platform looks and behaves like a real product, not a slide or chat wrapper.
- Rain and Monad are in the causal path of the mission.
- Provider receipts and outcome evidence survive a page refresh.
- The platform never duplicates or overrides Rain/Monad infrastructure controls.
- The demo can run live, replay a previously verified run, and explain the distinction honestly.

## Status

- [x] Official workshop sources audited; third-party source files archived privately
- [x] Git repository initialized
- [x] Full specification package created
- [x] Private GitHub repository created
- [x] Local Next.js fixture vertical slice built
- [x] Deterministic domain and provider-boundary tests passing
- [x] Protected Vercel Preview deployed and verified
- [x] Workshop credentials preflighted for the bounded Rain evidence operations
- [ ] Rain sandbox flow proven
- [ ] Monad x402 flow proven
- [ ] P0 product built with verified live sandbox/testnet rails
- [ ] Demo recorded and submission packaged
