# Public repository sanitization manifest

Checked August 9, 2026.

## Retained

The public snapshot retains application source, tests, database migrations,
runtime configuration names, current screenshots, public-safe redacted evidence,
CI, contribution/security guidance, and the documentation needed to build,
verify, explain, and submit SpendForge.

## Removed from the tree and reachable history

| Path or path family | Reason |
|---|---|
| `raingentic-hackathon-starter-kit.pdf` | Third-party organizer material without an established redistribution grant. |
| `raingentic-monad-builder-one-pager.pdf` | Third-party organizer/provider material without an established redistribution grant. |
| `raingentic-hackathon-5-ideas` | Superseded concept memo; not required to build or review SpendForge. |
| `src/app/api/integrations/rain/{card-issue,collateral-window,fund-async,fund-shape,proof,reconcile}/route.ts` | Retired one-shot execution surfaces and attempt material. |
| `src/lib/integrations/rain/proof.ts` | Retired provider-proof implementation. |
| `tests/contract/rain-{card-issue-route,collateral-window-route,fund-async-route,fund-shape-route,proof-route,reconciliation-route}.test.ts` | Tests for retired execution surfaces. |
| `tests/integration/rain-live.test.ts` | Retired credential-gated proof harness. |
| `docs/screenshots/{04-rain-202-safe-stop,05-rain-card-readback,07-proof-ledger,09-policy-gates}.png` | Superseded screenshots and proof language. |

The source files and a complete pre-rewrite Git bundle are preserved in an
owner-only archive outside this repository. Their hashes and recovery procedure
are recorded in that private archive. The archive must not be published.

## Guard

`npm.cmd run verify:public` fails when forbidden source names, retired proof
paths, tracked environment files, secret assignments, or private-machine paths
appear in the current tree or reachable Git object names. Publication requires
this check plus the full code, browser, dependency, Preview, and GitHub checks in
`docs/PUBLIC-RELEASE-CHECKLIST.md`.
