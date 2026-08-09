# Durable operation journal setup

**Implementation status:** built, wired, and proven on a dedicated free
Preview-only Neon database. No Production database or variable exists.

SpendForge now claims each bounded provider mutation by atomically inserting an
append-only `submitted` journal entry before any outbound provider call. The
Rain funding and scoped-card routes use this path. The Monad/x402 gateway has a
durable attempt-gate implementation, but no live payment Route Handler is wired.

The runtime never creates or migrates a database. A missing connection, missing
table, permission error, timeout, malformed stored row, or compare-and-set race
fails closed. Before the mutation claim is durable, zero provider requests are
made. After a mutation, a journal-finalization failure is reported as
non-retryable and does not become a success claim.

## Completed protected-Preview setup

The following setup was completed without printing, storing, or committing a
connection string or password:

1. A dedicated Neon `free_v3` database was attached to the existing private
   SpendForge Vercel project for **Preview only**.
2. A migration-owner connection applied
   [`migrations/001_provider_operation_journal.sql`](../migrations/001_provider_operation_journal.sql)
   exactly once.
3. The setup script created a dedicated `NOINHERIT` runtime login and granted
   it only:
   `CONNECT` on the selected database, `USAGE` on schema `public`, and `SELECT,
   INSERT` on `public.spendforge_operation_journal_v1`. Explicitly deny
   `UPDATE`, `DELETE`, `TRUNCATE`, schema creation, and DDL. Keep the migration
   owner out of Vercel runtime variables.
4. Vercel `DATABASE_URL` was replaced with that restricted role's pooled URL,
   marked Sensitive, and scoped to **Preview** only.
5. A protected-Preview synthetic proof verified the schema, permission shape,
   one CAS winner and one blocked duplicate under concurrent claims, and
   persistence across a second connection. The proof route was then removed.
   Every provider gate remained closed and provider/model call counts were zero.

Neon's serverless driver is pinned at `1.1.0`. The store accepts only a complete
`postgres://` or `postgresql://` URL, uses parameterized queries, and times out
database calls after eight seconds.

## Required permission shape

Run the role grants as the migration owner, substituting the actual database and
role identifiers inside Neon rather than committing them:

```sql
GRANT CONNECT ON DATABASE <database_name> TO <runtime_role>;
GRANT USAGE ON SCHEMA public TO <runtime_role>;
GRANT SELECT, INSERT
  ON public.spendforge_operation_journal_v1
  TO <runtime_role>;
REVOKE UPDATE, DELETE, TRUNCATE
  ON public.spendforge_operation_journal_v1
  FROM <runtime_role>;
```

The migration also rejects row rewrites and table truncation with triggers. A
runtime role must not own the table, because a table owner can alter or bypass
those controls.

## Proof and remaining boundary

The unit and contract suites prove the application-level CAS behavior with a
deterministic store and a parameterized Postgres executor mock: concurrent
claims allow exactly one outbound attempt, duplicate fingerprints stop, and
database failures stop before transport. The protected-Preview proof additionally
established that the migration is applied, Neon is reachable from Vercel, the
runtime role has only the intended privileges, concurrent database claims have
one winner, and entries persist across connections. The safe evidence record is
[`preview-journal-proof-20260808-v2.json`](../evidence/database/preview-journal-proof-20260808-v2.json).

This is a provider-operation journal only. It does not persist canonical
missions, model decisions, run events, cumulative budget reservations,
payments, deliveries, or artifacts. It made no Rain, Monad, facilitator,
wallet, x402-payment, or OpenAI request. The permanent
`GET /api/health/journal` endpoint is read-only and returns only readiness and
permission booleans.

The owner-only maintenance command is intentionally explicit and should not be
run merely to test connectivity, because it rotates the restricted runtime
password and updates the Preview variable:

```powershell
npm.cmd exec --yes vercel@latest -- env run -e preview -- node scripts/setup-preview-journal.mjs --apply-preview
```

Run it only against the dedicated SpendForge Preview resource, with every
provider/model gate closed. It refuses missing/invalid Neon owner connections,
open gates, permission mismatches, and non-Preview Vercel updates without
printing a connection string.

For the current one-shot routes, each operation's full SHA-256 idempotency
fingerprint is also its journal scope. A later multi-purchase orchestrator must
use a run/mandate scope so mutation-count and cumulative-budget rules can apply
across distinct attempts; it must still retain the per-attempt fingerprint as
the global duplicate key.

Official setup references:

- [Neon serverless driver](https://neon.com/docs/serverless/serverless-driver)
- [Vercel Marketplace storage](https://vercel.com/docs/marketplace-storage)
- [Neon on Vercel Marketplace](https://vercel.com/marketplace/neon)
