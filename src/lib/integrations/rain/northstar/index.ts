// The Northstar Rain sandbox proof splits into two halves that must not be
// confused:
//
//   receipt.ts  — the read-only path the application serves. The ledger page
//                 and the public audit receipt route import from here. It
//                 reads the append-only journal and builds a redacted receipt.
//                 No provider mutation is reachable from this module.
//
//   execute.ts  — the one-shot proof runner. It issues the scoped card,
//                 authorizes, settles, and reconciles against Rain's sandbox.
//                 It is invoked only by `scripts/run-rain-northstar-proof.ts`
//                 and by contract tests, never by a rendered route.
//
// Only the read path is re-exported here so an accidental `@/lib/integrations`
// import cannot pull provider mutation into the application bundle. Import
// `./execute` explicitly to run the proof.
export {
  RAIN_NORTHSTAR_PROOF_RECEIPT_ID,
  RAIN_NORTHSTAR_RUN_SCOPE,
} from "./constants";
export { RainNorthstarProofError } from "./provider";
export {
  readRainNorthstarAttemptReceipt,
  readRainNorthstarProof,
  type RainNorthstarProofResult,
} from "./receipt";
