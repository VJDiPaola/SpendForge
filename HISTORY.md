# Build history

## Why the commit timestamps are clustered

Every commit on this repository is dated August 9, 2026, within a three-hour
window. That is not when the work happened. It is when the public repository
was created.

SpendForge was built over a hackathon weekend in a private working repository
that contained material which could not be published:

- organizer-provided PDFs and partner one-pagers, redistributed without an
  established grant;
- one-shot provider execution surfaces that carried live credential handling
  and attempt material;
- a credential-gated integration test harness;
- screenshots and proof language superseded during the run.

Publishing the working repository as-is was not an option, and removing those
paths from the tip alone would have left them reachable in history. The public
repository was therefore created as a rewritten snapshot: forbidden paths are
unreachable from any object, and `npm run verify:public` fails the build if any
of them reappear in the tree or in reachable Git object names.

The cost of that decision is the one visible here — the incremental build
record does not survive into the public history. The full pre-rewrite bundle is
retained in a private archive; the removal manifest and rationale are in
[`docs/REPOSITORY-SANITIZATION.md`](./docs/REPOSITORY-SANITIZATION.md).

## What the commits do show

The eleven published commits are the sanitization and release sequence, not the
build sequence. Read in order they trace the final day: publishing the runnable
application, recording release state, hardening the public-history guard, then
four commits narrowing the Rain sandbox proof as each readback contradicted the
prior assumption about what the provider had actually confirmed.

That last stretch is the honest part of the record. `fix: scope Rain proof
attempts by authorization generation`, `fix: match Rain sandbox settlement
contract`, and `fix: preserve mixed Rain receipt authority` are three successive
corrections to the same question: what is SpendForge entitled to call
"completed"? The answer that survived is the one enforced in code today — a
Rain spend is not marked completed until a direct `GET` on the transaction
returns the expected terminal record, and provider acknowledgment alone is
never authoritative.

## Post-submission work

Commits after August 9, 2026 are ordinary incremental history and reflect real
working time. They address a code review of the submission: consolidating the
duplicated policy engines, moving the one-shot proof runner out of application
code, relocating unproven payment-rail scaffolding to `experimental/`, and
restructuring the documentation.
