/**
 * Verify the HMAC-SHA256 signature on a SpendForge audit receipt.
 *
 * Usage:
 *   npm run verify:receipt -- <file.json>
 *   npm run verify:receipt -- <url>
 *   cat receipt.json | npm run verify:receipt
 *
 * By default this uses the published demo key, so a fresh clone can verify a
 * receipt downloaded from the running application with no setup. A receipt
 * signed by a deployment key requires RECEIPT_SIGNING_KEY (and, if it differs
 * from "deployment-v1", RECEIPT_SIGNING_KEY_ID) in the environment.
 *
 * Exit code 0 means the signature matched. Exit code 1 means it did not, or
 * the receipt could not be read.
 */
import { readFile } from "node:fs/promises";

import {
  resolveReceiptSigningKey,
  verifyAuditReceipt,
} from "../src/lib/operations/receipt-signature";

async function readSource(source: string | undefined): Promise<string> {
  if (!source) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    if (chunks.length === 0) {
      throw new Error(
        "No receipt given. Pass a file path or URL, or pipe JSON on stdin.",
      );
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  if (/^https?:\/\//u.test(source)) {
    const response = await fetch(source, {
      headers: { Accept: "application/json" },
      redirect: "error",
    });
    if (!response.ok) {
      throw new Error(`Fetching ${source} returned HTTP ${response.status}`);
    }
    return response.text();
  }

  return readFile(source, "utf8");
}

async function main(): Promise<void> {
  const source = process.argv[2];
  const raw = await readSource(source);

  let receipt: unknown;
  try {
    receipt = JSON.parse(raw);
  } catch {
    throw new Error("Receipt is not valid JSON");
  }

  const signingKey = resolveReceiptSigningKey();
  const result = verifyAuditReceipt(receipt, signingKey);

  if (!result.valid) {
    console.error(`FAIL  ${result.reason}`);
    process.exit(1);
  }

  const label = source ?? "stdin";
  console.log(`PASS  signature verified for ${label}`);
  console.log(`      key: ${result.keyId}`);
  if (result.usedPublishedDemoKey) {
    console.log(
      "      This is the published demo key. A matching signature proves the\n" +
        "      receipt is byte-for-byte what SpendForge produced. It does not\n" +
        "      prove authorship, because anyone can hold this key.",
    );
  }
}

main().catch((error: unknown) => {
  console.error(`FAIL  ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
