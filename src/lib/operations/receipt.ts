import { deriveEvidenceFingerprint } from "./fingerprint";
import { assertCanonicalOperationJournal } from "./journal";
import { assertUiSafePayload } from "./redaction";
import {
  auditReceiptSchema,
  canonicalIsoDateTimeSchema,
  publicAuditReceiptIdSchema,
  type AuditReceipt,
  type AuditTruthBoundary,
  type AuthoritativeReadbackState,
  type OperationJournalEntry,
  type OperationMode,
  type OperationProvider,
} from "./schemas";

const modeOrder: readonly OperationMode[] = [
  "fixture",
  "live-sandbox",
  "testnet",
  "live-model",
];
const providerOrder: readonly OperationProvider[] = [
  "rain",
  "monad_x402",
  "openai",
];

function latestEntries(entries: readonly OperationJournalEntry[]) {
  const latest = new Map<string, OperationJournalEntry>();
  entries.forEach((entry) => latest.set(entry.operationRef, entry));
  return [...latest.values()];
}

function determineTruthBoundary(
  entries: readonly OperationJournalEntry[],
): AuditTruthBoundary {
  const latest = latestEntries(entries);
  const boundaries = new Set(latest.map((entry) => entry.truthBoundary));
  const modes = new Set(latest.map((entry) => entry.mode));

  if (modes.size === 1 && modes.has("fixture")) return "fixture-only";
  if (boundaries.has("provider-ambiguous")) return "provider-ambiguous";
  if (boundaries.has("provider-failed")) return "provider-failed";
  if (boundaries.has("provider-declined")) return "provider-declined";
  if (boundaries.has("model-ambiguous")) return "model-ambiguous";
  if (boundaries.has("model-failed")) return "model-failed";
  if (
    modes.size === 1 &&
    modes.has("live-model") &&
    boundaries.has("model-structured-output")
  ) {
    return "model-structured-output";
  }

  const hasAuthoritative = [...boundaries].some((boundary) =>
    boundary.endsWith("-authoritative"),
  );
  const hasUnconfirmed = [...boundaries].some((boundary) =>
    boundary.endsWith("-unconfirmed"),
  );
  if (hasAuthoritative && (hasUnconfirmed || modes.size > 1)) {
    return "mixed-authoritative";
  }
  if (hasAuthoritative) {
    return modes.has("live-sandbox")
      ? "sandbox-authoritative"
      : "testnet-authoritative";
  }
  if (modes.size > 1) return "mixed-unconfirmed";
  return modes.has("live-sandbox")
    ? "sandbox-unconfirmed"
    : modes.has("testnet")
      ? "testnet-unconfirmed"
      : "model-unconfirmed";
}

function countReadbacks(entries: readonly OperationJournalEntry[]) {
  const counts: Record<AuthoritativeReadbackState, number> = {
    "not-required": 0,
    "not-started": 0,
    pending: 0,
    "matched-nonterminal": 0,
    "matched-terminal": 0,
    "no-match": 0,
    ambiguous: 0,
    unavailable: 0,
  };
  latestEntries(entries).forEach((entry) => {
    counts[entry.authoritativeReadback.state] += 1;
  });
  return {
    notRequired: counts["not-required"],
    notStarted: counts["not-started"],
    pending: counts.pending,
    matchedNonterminal: counts["matched-nonterminal"],
    matchedTerminal: counts["matched-terminal"],
    noMatch: counts["no-match"],
    ambiguous: counts.ambiguous,
    unavailable: counts.unavailable,
  };
}

export function buildAuditReceipt(
  metadata: { receiptId: string; generatedAt: string },
  entries: readonly OperationJournalEntry[],
): AuditReceipt {
  assertCanonicalOperationJournal(entries);
  if (entries.length === 0) {
    throw new Error("An audit receipt requires at least one journal entry");
  }

  const receiptId = publicAuditReceiptIdSchema.parse(metadata.receiptId);
  const generatedAt = canonicalIsoDateTimeSchema.parse(metadata.generatedAt);
  const latest = latestEntries(entries);
  const modes = modeOrder.filter((mode) =>
    entries.some((entry) => entry.mode === mode),
  );
  const providers = providerOrder.filter((provider) =>
    entries.some((entry) => entry.provider === provider),
  );
  const mutationRefs = new Set(
    entries.filter((entry) => entry.mutation).map((entry) => entry.operationRef),
  );
  const readbackCounts = countReadbacks(entries);
  const truthBoundary = determineTruthBoundary(entries);
  const operations = entries.map((entry) =>
    operationClone(entry),
  );

  const receipt = auditReceiptSchema.parse({
    schemaVersion: 1,
    receiptId,
    generatedAt,
    modes,
    providers,
    truthBoundary,
    redacted: true,
    synthetic: modes.length === 1 && modes[0] === "fixture",
    disclosureCode:
      truthBoundary === "fixture-only"
        ? "FIXTURE_NO_PROVIDER_CALL"
        : truthBoundary === "model-structured-output"
          ? "MODEL_PROPOSAL_ONLY_NO_PAYMENT_EXECUTION"
        : truthBoundary.includes("authoritative")
          ? "AUTHORITATIVE_READBACK_ATTACHED"
          : "PROVIDER_OUTCOME_NOT_TERMINAL",
    journalHash: deriveSafeJournalHash(JSON.stringify(operations)),
    summary: {
      operationCount: latest.length,
      mutationCount: mutationRefs.size,
      authoritativeTerminalCount: readbackCounts.matchedTerminal,
      readbackCounts,
    },
    operations,
  });

  assertUiSafePayload(receipt);
  return receipt;
}

/**
 * A SHA-256 digest is public-safe, but a hexadecimal digest can occasionally
 * contain a 13–19 digit Luhn-valid run and trigger the defense-in-depth PAN
 * scanner. Keep the strict fingerprint schema while deterministically
 * domain-separating the digest until its public representation is scanner-safe.
 */
function deriveSafeJournalHash(serializedOperations: string): string {
  for (let salt = 0; salt < 64; salt += 1) {
    const candidate = deriveEvidenceFingerprint(
      `spendforge-public-journal:${salt}:${serializedOperations}`,
    );
    try {
      assertUiSafePayload(candidate, "journalHash");
      return candidate;
    } catch {
      // A rare PAN-shaped digest is discarded; no provider or payload value is
      // exposed, and the next deterministic domain separator is tried.
    }
  }
  throw new Error("Unable to derive a scanner-safe journal hash");
}

function operationClone(entry: OperationJournalEntry): OperationJournalEntry {
  const publicEntry = { ...entry };
  delete publicEntry.recoveryEnvelope;
  return JSON.parse(JSON.stringify(publicEntry)) as OperationJournalEntry;
}
