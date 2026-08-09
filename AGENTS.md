# SpendForge build instructions

This repository is spec-first. Read this file and the complete `docs/spec/` package before writing application code.

## Objective

Build a credible, deployable Vercel platform that demonstrates an agent autonomously purchasing useful resources over both Rain and Monad, attaching authoritative payment receipts and outcome evidence, and proposing a bounded future budget.

## Source-of-truth order

When sources disagree, use this order and document the conflict:

1. Workshop credentials, live Rain playground schemas, and authoritative API responses.
2. Current official Monad and x402 documentation for the installed package version.
3. The specification package in `docs/spec/`.
4. Redacted authoritative evidence checked into `evidence/`.

Organizer PDFs and the superseded concept memo are preserved only in the
owner's private off-repository archive. They are not public build inputs and
must not be recommitted.

Never invent a request field, resource ID, transaction state, package export, or provider capability. Update the spec if live truth requires a change.

## Required reading

1. `BRIEF.md`
2. `docs/spec/00-PACKAGE-INDEX.md`
3. `docs/spec/02-CAPABILITY-BOUNDARIES.md`
4. `docs/spec/05-TECHNICAL-ARCHITECTURE.md`
5. The workstream-specific document referenced in `docs/spec/08-BUILD-HANDOFF.md`

## Non-negotiable rules

- Rain and Monad are authoritative payment systems. Do not recreate their enforcement, wallets, facilitator, settlement, identity registries, or chain indexing.
- Keep Rain keys, session IDs, wallet private keys, and provider credentials server-only. They must never enter prompts, client bundles, screenshots, fixtures, or logs.
- The model may propose a purchase. Typed server code validates and executes it.
- Never display a payment as successful until authoritative readback proves it: Rain transaction readback for Rain, facilitator/chain receipt for Monad.
- Show `Rain Sandbox` and `Monad Testnet` prominently. Never claim that workshop flows moved production funds.
- Preserve integer monetary units. Do not use floating-point arithmetic for money.
- Every mutating call needs an idempotency strategy. A retry must not create a duplicate purchase.
- Do not show hidden chain-of-thought. Display a concise, structured decision summary.
- Provider tools such as Daytona, Modal, Claude Code, or Vercel Sandbox are optional adapters, not required architecture.
- Keep seeded or synthetic merchants, products, outcomes, and datasets labeled.
- Update `docs/DEMO-NOTES.md` whenever the real/fallback boundary changes.

## Implementation defaults

- Next.js App Router, TypeScript, Node.js runtime, and Vercel.
- Server Components for reads, Server Actions for internal UI mutations, and Route Handlers for external integrations and the x402 resource endpoint.
- A provider-neutral `DecisionModel` interface. Pick the available model during preflight.
- A provider-neutral resource delivery interface. P0 composes vetted manifests and does not execute arbitrary code.
- Postgres-compatible persistence through `DATABASE_URL`; maintain an in-memory adapter for tests only.
- Use `npm.cmd` on Windows.

## Build and verification gates

Do not call the project complete until all of these are true:

- Rain fund, issue, authorize, settle, and readback flow is proven with workshop credentials.
- Monad x402 v2 payment is proven on testnet with a transaction reference.
- One purchase is declined and one policy violation is blocked.
- The purchased resources visibly affect the resulting artifact.
- Ledger states reconcile to provider truth after refresh.
- The deployed URL works in an incognito window.
- Playwright passes the live-sandbox happy path and the critical failure paths.
- The final Supercut video and backup recording are tested while logged out.

Commit every working state. Do not mix unrelated workstreams in one commit.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
