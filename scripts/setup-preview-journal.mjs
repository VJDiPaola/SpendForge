import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { Client } from "@neondatabase/serverless";

const RUNTIME_ROLE = "spendforge_runtime";
const MIGRATION_PATH = fileURLToPath(
  new URL("../migrations/001_provider_operation_journal.sql", import.meta.url),
);
const PROVIDER_GATES = [
  "RAIN_MUTATIONS_ENABLED",
  "RAIN_FUNDING_ENABLED",
  "RAIN_CARD_ISSUANCE_ENABLED",
  "RAIN_AUTHORIZATION_ENABLED",
  "RAIN_SETTLEMENT_ENABLED",
  "RAIN_NORTHSTAR_PROOF_WINDOW_OPEN",
  "RAIN_NORTHSTAR_RECONCILIATION_WINDOW_OPEN",
  "MONAD_X402_PAYMENT_ENABLED",
  "MONAD_X402_SELLER_ENABLED",
  "OPENAI_DECISION_ENABLED",
  "OPENAI_DECISION_PROOF_WINDOW_OPEN",
];
let activeStage = "INITIALIZATION";

class SafeSetupError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function assertProviderGatesClosed() {
  if (PROVIDER_GATES.some((name) => process.env[name] === "true")) {
    throw new SafeSetupError("PROVIDER_GATE_OPEN");
  }
}

function parseOwnerUrls() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new SafeSetupError("DATABASE_URL_MISSING");

  let pooled;
  try {
    pooled = new URL(raw);
  } catch {
    throw new SafeSetupError("DATABASE_URL_INVALID");
  }

  if (
    !["postgres:", "postgresql:"].includes(pooled.protocol) ||
    !pooled.username ||
    !pooled.password ||
    !pooled.hostname.endsWith(".neon.tech") ||
    pooled.pathname === "/"
  ) {
    throw new SafeSetupError("DATABASE_URL_NOT_DEDICATED_NEON");
  }

  const direct = new URL(pooled);
  direct.hostname = direct.hostname.replace("-pooler.", ".");
  return { pooled, direct };
}

function quoteIdentifier(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 63) {
    throw new SafeSetupError("DATABASE_IDENTIFIER_INVALID");
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function runVercelEnvUpdate(runtimeUrl) {
  const npmEntrypoint = process.env.npm_execpath;
  if (!npmEntrypoint) {
    throw new SafeSetupError("NPM_ENTRYPOINT_MISSING");
  }
  const executable = process.execPath;
  const args = [
    npmEntrypoint,
    "exec",
    "--yes",
    "vercel@latest",
    "--",
    "env",
    "update",
    "DATABASE_URL",
    "preview",
    "--sensitive",
    "--yes",
    "--no-color",
  ];

  await new Promise((resolve, reject) => {
    let diagnostic = "";
    const child = spawn(executable, args, {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: process.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const retainDiagnostic = (chunk) => {
      if (diagnostic.length < 16_384) {
        diagnostic += chunk.toString("utf8").slice(0, 16_384 - diagnostic.length);
      }
    };
    child.stdout.on("data", retainDiagnostic);
    child.stderr.on("data", retainDiagnostic);
    child.once("error", () => reject(new SafeSetupError("VERCEL_ENV_UPDATE_FAILED")));
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else {
        const normalized = diagnostic.toLowerCase();
        const failureCode = /managed|marketplace|integration/.test(normalized)
          ? "VERCEL_MANAGED_ENV_UPDATE_UNAVAILABLE"
          : /forbidden|unauthorized|permission/.test(normalized)
            ? "VERCEL_ENV_PERMISSION_DENIED"
            : /not found|does not exist/.test(normalized)
              ? "VERCEL_DATABASE_URL_NOT_FOUND"
              : /unknown option|invalid option/.test(normalized)
                ? "VERCEL_ENV_CLI_OPTION_MISMATCH"
                : "VERCEL_ENV_UPDATE_FAILED";
        reject(new SafeSetupError(failureCode));
      }
    });
    child.stdin.end(`${runtimeUrl}\n`);
  });
}

async function main() {
  activeStage = "PREVIEW_GUARD";
  if (!process.argv.includes("--apply-preview")) {
    throw new SafeSetupError("EXPLICIT_PREVIEW_FLAG_REQUIRED");
  }
  assertProviderGatesClosed();

  const { pooled, direct } = parseOwnerUrls();
  activeStage = "MIGRATION_INPUT";
  const client = new Client({ connectionString: direct.toString() });
  const migration = await readFile(MIGRATION_PATH, "utf8");
  const password = randomBytes(32).toString("base64url");

  try {
    activeStage = "OWNER_CONNECT";
    await client.connect();
    activeStage = "OWNER_IDENTITY";
    const identity = await client.query(
      "SELECT current_user, current_database() AS database_name",
    );
    const databaseName = identity.rows[0]?.database_name;
    const currentUser = identity.rows[0]?.current_user;
    if (
      typeof databaseName !== "string" ||
      typeof currentUser !== "string" ||
      currentUser === RUNTIME_ROLE
    ) {
      throw new SafeSetupError("MIGRATION_OWNER_REQUIRED");
    }

    activeStage = "MIGRATION_APPLY";
    await client.query(migration);

    const runtimeRole = quoteIdentifier(RUNTIME_ROLE);
    const database = quoteIdentifier(databaseName);
    const passwordLiteral = quoteLiteral(password);
    activeStage = "RUNTIME_ROLE_CONFIGURE";
    await client.query("BEGIN");
    try {
      const existing = await client.query(
        "SELECT 1 FROM pg_roles WHERE rolname = $1",
        [RUNTIME_ROLE],
      );
      if (existing.rowCount === 0) {
        await client.query(
          `CREATE ROLE ${runtimeRole} LOGIN NOINHERIT PASSWORD ${passwordLiteral}`,
        );
      } else {
        await client.query(
          `ALTER ROLE ${runtimeRole} WITH LOGIN NOINHERIT PASSWORD ${passwordLiteral}`,
        );
      }
      await client.query(`REVOKE TEMPORARY ON DATABASE ${database} FROM PUBLIC`);
      await client.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
      await client.query(`REVOKE ALL PRIVILEGES ON DATABASE ${database} FROM ${runtimeRole}`);
      await client.query(`GRANT CONNECT ON DATABASE ${database} TO ${runtimeRole}`);
      await client.query(`REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${runtimeRole}`);
      await client.query(`GRANT USAGE ON SCHEMA public TO ${runtimeRole}`);
      await client.query(
        `REVOKE ALL PRIVILEGES ON public.spendforge_operation_journal_v1 FROM ${runtimeRole}`,
      );
      await client.query(
        `GRANT SELECT, INSERT ON public.spendforge_operation_journal_v1 TO ${runtimeRole}`,
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    activeStage = "RUNTIME_ROLE_VERIFY";
    const permissions = await client.query(
      `SELECT
        NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole
          AND NOT r.rolreplication AND NOT r.rolbypassrls AS restricted_role,
        has_database_privilege($1, current_database(), 'CONNECT') AS can_connect,
        has_database_privilege($1, current_database(), 'TEMPORARY') AS can_temp,
        has_schema_privilege($1, 'public', 'USAGE') AS can_use_schema,
        has_schema_privilege($1, 'public', 'CREATE') AS can_create_schema_objects,
        has_table_privilege($1, 'public.spendforge_operation_journal_v1', 'SELECT') AS can_select,
        has_table_privilege($1, 'public.spendforge_operation_journal_v1', 'INSERT') AS can_insert,
        has_table_privilege($1, 'public.spendforge_operation_journal_v1', 'UPDATE') AS can_update,
        has_table_privilege($1, 'public.spendforge_operation_journal_v1', 'DELETE') AS can_delete,
        has_table_privilege($1, 'public.spendforge_operation_journal_v1', 'TRUNCATE') AS can_truncate
      FROM pg_roles r
      WHERE r.rolname = $1`,
      [RUNTIME_ROLE],
    );
    const proof = permissions.rows[0];
    if (
      !proof?.restricted_role ||
      !proof.can_connect ||
      proof.can_temp ||
      !proof.can_use_schema ||
      proof.can_create_schema_objects ||
      !proof.can_select ||
      !proof.can_insert ||
      proof.can_update ||
      proof.can_delete ||
      proof.can_truncate
    ) {
      throw new SafeSetupError("RUNTIME_ROLE_PERMISSION_MISMATCH");
    }

    const runtimeUrl = new URL(pooled);
    runtimeUrl.username = RUNTIME_ROLE;
    runtimeUrl.password = password;
    activeStage = "VERCEL_ENV_UPDATE";
    await runVercelEnvUpdate(runtimeUrl.toString());

    console.log(
      JSON.stringify({
        status: "pass",
        migrationApplied: true,
        runtimeRoleRestricted: true,
        previewDatabaseUrlUpdated: true,
        providerGatesClosed: true,
        providerCalls: 0,
      }),
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  const code =
    error instanceof SafeSetupError
      ? error.code
      : `PREVIEW_JOURNAL_${activeStage}_FAILED`;
  console.error(JSON.stringify({ status: "failed", code, providerCalls: 0 }));
  process.exitCode = 1;
});
