BEGIN;

CREATE TABLE IF NOT EXISTS public.spendforge_operation_journal_v1 (
  scope_fingerprint text NOT NULL
    CHECK (scope_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  sequence integer NOT NULL CHECK (sequence > 0),
  entry_ref text NOT NULL CHECK (entry_ref ~ '^entry_[0-9a-f]{24}$'),
  operation_ref text NOT NULL
    CHECK (operation_ref ~ '^op_[a-z0-9_]{8,64}$'),
  idempotency_fingerprint text
    CHECK (
      idempotency_fingerprint IS NULL OR
      idempotency_fingerprint ~ '^sha256:[0-9a-f]{64}$'
    ),
  operation_state text NOT NULL CHECK (
    operation_state IN (
      'planned',
      'gate-passed',
      'gate-blocked',
      'submitted',
      'provider-accepted',
      'provider-pending',
      'readback-pending',
      'provider-confirmed',
      'provider-declined',
      'provider-failed',
      'ambiguous',
      'closed'
    )
  ),
  mutation boolean NOT NULL,
  occurred_at timestamptz NOT NULL,
  entry_json jsonb NOT NULL
    CHECK (jsonb_typeof(entry_json) = 'object')
    CHECK (
      (entry_json ->> 'sequence')::integer IS NOT DISTINCT FROM sequence
    )
    CHECK (entry_json ->> 'entryRef' IS NOT DISTINCT FROM entry_ref)
    CHECK (entry_json ->> 'operationRef' IS NOT DISTINCT FROM operation_ref)
    CHECK (entry_json ->> 'state' IS NOT DISTINCT FROM operation_state)
    CHECK (
      (entry_json ->> 'mutation')::boolean IS NOT DISTINCT FROM mutation
    )
    CHECK (
      (entry_json ->> 'occurredAt')::timestamptz
      IS NOT DISTINCT FROM occurred_at
    )
    CHECK (
      entry_json ->> 'idempotencyFingerprint'
      IS NOT DISTINCT FROM idempotency_fingerprint
    ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT mutation OR idempotency_fingerprint IS NOT NULL),
  PRIMARY KEY (scope_fingerprint, sequence),
  UNIQUE (scope_fingerprint, entry_ref)
);

CREATE UNIQUE INDEX IF NOT EXISTS spendforge_operation_journal_v1_submission_key
  ON public.spendforge_operation_journal_v1 (idempotency_fingerprint)
  WHERE mutation = true
    AND operation_state = 'submitted'
    AND idempotency_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS spendforge_operation_journal_v1_operation_idx
  ON public.spendforge_operation_journal_v1 (
    scope_fingerprint,
    operation_ref,
    sequence
  );

CREATE OR REPLACE FUNCTION public.spendforge_reject_operation_journal_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'SpendForge operation journal is append-only';
END;
$$;

DROP TRIGGER IF EXISTS spendforge_operation_journal_v1_append_only
  ON public.spendforge_operation_journal_v1;

CREATE TRIGGER spendforge_operation_journal_v1_append_only
BEFORE UPDATE OR DELETE ON public.spendforge_operation_journal_v1
FOR EACH ROW EXECUTE FUNCTION public.spendforge_reject_operation_journal_rewrite();

DROP TRIGGER IF EXISTS spendforge_operation_journal_v1_no_truncate
  ON public.spendforge_operation_journal_v1;

CREATE TRIGGER spendforge_operation_journal_v1_no_truncate
BEFORE TRUNCATE ON public.spendforge_operation_journal_v1
FOR EACH STATEMENT EXECUTE FUNCTION public.spendforge_reject_operation_journal_rewrite();

REVOKE UPDATE, DELETE, TRUNCATE
  ON public.spendforge_operation_journal_v1
  FROM PUBLIC;

COMMIT;
