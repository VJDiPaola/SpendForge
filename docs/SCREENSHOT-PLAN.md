# SpendForge screenshot plan

> **Archive note.** This is the pre-completion capture plan. The current public
> proof posture is shown in [`01-proof-posture.png`](./screenshots/01-proof-posture.png);
> superseded safe-stop frames are not linked from the primary README.

**Status:** Captured August 9, 2026 from the verified local production build.
Screenshots are product presentation evidence, not independent provider proof.
**Viewport:** 1440×900 at 100% zoom.

| File | Route/state | Truth requirement |
|---|---|---|
| `01-proof-posture.png` | `/` | Live bounded model proof named; Rain authorization partial; Monad unproven; synthetic/fixture boundary visible |
| `02-mission-ready.png` | Atlas before Run | Budget, cap, fixture badge, queued stages; no provider implication |
| `03-decision-complete.png` | Atlas fixture complete | Decline + hard blocks + fixture artifact; fixture label visible |
| `04-rain-authorization-safe-stop.png` | `?scenario=rain-async` | Card/readback and authorization matched; one settlement POST returned HTTP 400 and bounded readbacks stayed nonterminal |
| `05-rain-partial-proof.png` | Rain ledger card | Authorization acceptance explicitly separated from settlement/money movement |
| `06-monad-unavailable.png` | Monad failure rehearsal | No transaction reference; delivery locked; synthetic rehearsal |
| `07-ledger-overview.png` | `/ledger` | Live/partial/fixture records separated; no canonical/full-spend claim |
| `08-atlas-artifact.png` | Artifact | Real rendered route, seeded manifests, fixture payment evidence |
| `09-approval-inbox.png` | Policies Approval Inbox | Deterministic fixture; Review/Approve/Reject states; no real message/checkout |

## Capture checks

- Clean browser frame; no personal tabs, notifications, bookmarks, or avatars.
- No key, full provider ID, wallet material, PAN/CVC, raw payload, or private
  machine path.
- Keep `Rain Sandbox`, `Monad Testnet`, `Fixture`, and `Synthetic` labels.
- Expand at most one progressive-disclosure panel.
- Do not crop away a truth label.
- A screenshot of an authorization request or response never proves settlement.
- Re-run the capture script after final copy changes and visually inspect every
  PNG before publishing the repository.
