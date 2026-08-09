import "server-only";

import { neon } from "@neondatabase/serverless";

import { databaseUrlSchema } from "./database-url";

export type JournalReadiness = {
  ok: boolean;
  environment: "preview";
  configured: true;
  runtimeRoleMatched: boolean;
  schemaReady: boolean;
  permissions: {
    select: boolean;
    insert: boolean;
    update: boolean;
    delete: boolean;
    truncate: boolean;
    schemaCreate: boolean;
    temporaryTables: boolean;
  };
  truthBoundary: "read-only-database-configuration-check";
  providerCalls: 0;
};

export class JournalReadinessError extends Error {
  constructor(readonly code: "JOURNAL_READINESS_UNAVAILABLE") {
    super(code);
    this.name = "JournalReadinessError";
  }
}

export async function getJournalReadiness(
  source: Record<string, string | undefined> = process.env,
): Promise<JournalReadiness> {
  if (source.VERCEL_ENV !== "preview") {
    throw new JournalReadinessError("JOURNAL_READINESS_UNAVAILABLE");
  }
  const parsed = databaseUrlSchema.safeParse(source.DATABASE_URL);
  if (!parsed.success) {
    throw new JournalReadinessError("JOURNAL_READINESS_UNAVAILABLE");
  }

  try {
    const sql = neon(parsed.data, {
      fetchOptions: { signal: AbortSignal.timeout(8_000) },
    });
    const rows = await sql.query(
      `SELECT
        current_user = 'spendforge_runtime' AS runtime_role_expected,
        to_regclass('public.spendforge_operation_journal_v1') IS NOT NULL AS table_ready,
        has_table_privilege(current_user, 'public.spendforge_operation_journal_v1', 'SELECT') AS can_select,
        has_table_privilege(current_user, 'public.spendforge_operation_journal_v1', 'INSERT') AS can_insert,
        has_table_privilege(current_user, 'public.spendforge_operation_journal_v1', 'UPDATE') AS can_update,
        has_table_privilege(current_user, 'public.spendforge_operation_journal_v1', 'DELETE') AS can_delete,
        has_table_privilege(current_user, 'public.spendforge_operation_journal_v1', 'TRUNCATE') AS can_truncate,
        has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_schema_objects,
        has_database_privilege(current_user, current_database(), 'TEMPORARY') AS can_temp`,
    );
    const row = rows[0];
    const readiness: JournalReadiness = {
      ok: Boolean(
        row?.runtime_role_expected &&
          row.table_ready &&
          row.can_select &&
          row.can_insert &&
          !row.can_update &&
          !row.can_delete &&
          !row.can_truncate &&
          !row.can_create_schema_objects &&
          !row.can_temp,
      ),
      environment: "preview",
      configured: true,
      runtimeRoleMatched: Boolean(row?.runtime_role_expected),
      schemaReady: Boolean(row?.table_ready),
      permissions: {
        select: Boolean(row?.can_select),
        insert: Boolean(row?.can_insert),
        update: Boolean(row?.can_update),
        delete: Boolean(row?.can_delete),
        truncate: Boolean(row?.can_truncate),
        schemaCreate: Boolean(row?.can_create_schema_objects),
        temporaryTables: Boolean(row?.can_temp),
      },
      truthBoundary: "read-only-database-configuration-check",
      providerCalls: 0,
    };
    return readiness;
  } catch (error) {
    if (error instanceof JournalReadinessError) throw error;
    throw new JournalReadinessError("JOURNAL_READINESS_UNAVAILABLE");
  }
}
