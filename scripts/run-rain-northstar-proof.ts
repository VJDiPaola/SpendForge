/**
 * One-shot Rain Sandbox proof runner.
 *
 * This is an operator tool, not application code. It performs real provider
 * mutations against Rain's sandbox (issue scoped card, authorize, settle) and
 * writes to the append-only operation journal. It refuses to run unless the
 * Preview-only environment gates in `northstar/schemas.ts` are all satisfied,
 * and the durable attempt gate allows at most one claim per operation.
 *
 * Usage:
 *   npm run proof:rain -- execute
 *   npm run proof:rain -- reconcile
 *   npm run proof:rain -- resume
 *   npm run proof:rain -- readiness
 *
 * The attempt id is read from RAIN_NORTHSTAR_AUTHORIZED_ATTEMPT_ID (execute) or
 * RAIN_NORTHSTAR_RECONCILIATION_ATTEMPT_ID (reconcile/resume).
 */
import {
  executeRainNorthstarProof,
  executeRainNorthstarResume,
  inspectRainNorthstarRecoveryContinuity,
  inspectRainReconciliationReadiness,
  reconcileRainNorthstarAuthorization,
} from "../src/lib/integrations/rain/northstar/execute";
import { RainNorthstarProofError } from "../src/lib/integrations/rain/northstar/provider";

type Command = "execute" | "reconcile" | "resume" | "readiness" | "continuity";

const commands = new Set<Command>([
  "execute",
  "reconcile",
  "resume",
  "readiness",
  "continuity",
]);

function usage(): never {
  console.error(
    `Usage: npm run proof:rain -- <${[...commands].join("|")}>\n\n` +
      "  execute     issue card, authorize, settle, and read back (3 mutations)\n" +
      "  reconcile   read-only: compare journal state to the provider record\n" +
      "  resume      settle an already-authorized transaction, then read back\n" +
      "  readiness   report which environment gates are satisfied\n" +
      "  continuity  report recoverable references in the journal\n",
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const command = process.argv[2] as Command | undefined;
  if (!command || !commands.has(command)) usage();

  if (command === "readiness") {
    console.log(JSON.stringify(inspectRainReconciliationReadiness(), null, 2));
    return;
  }

  if (command === "continuity") {
    const continuity = await inspectRainNorthstarRecoveryContinuity({});
    console.log(JSON.stringify(continuity, null, 2));
    return;
  }

  const attemptId =
    command === "execute"
      ? (process.env.RAIN_NORTHSTAR_AUTHORIZED_ATTEMPT_ID ?? null)
      : (process.env.RAIN_NORTHSTAR_RECONCILIATION_ATTEMPT_ID ?? null);

  const result =
    command === "execute"
      ? await executeRainNorthstarProof({ attemptId })
      : command === "resume"
        ? await executeRainNorthstarResume({ attemptId })
        : await reconcileRainNorthstarAuthorization({ attemptId });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  if (error instanceof RainNorthstarProofError) {
    console.error(`${error.code} (http ${error.status})`);
    console.error(
      `provider calls made before failure: ${error.providerCalls}. ` +
        "Mutations are never retried; inspect the journal before rerunning.",
    );
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});
