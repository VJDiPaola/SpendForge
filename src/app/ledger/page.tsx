import Link from "next/link";

import { EvidenceBoundary } from "@/components/evidence-boundary";
import { formatMoneyAtomic, shortReference } from "@/components/presentation";
import { PlatformShell } from "@/components/platform-shell";
import styles from "@/components/record-view.module.css";
import {
  ATLAS_AGENT_DECISION_RECEIPT_ID,
  buildAtlasFixtureDecisionAudit,
  buildAtlasFixtureRun,
} from "@/lib/demo";
import {
  OPENAI_DECISION_PROOF_RECEIPT_ID,
  readOpenAIDecisionProof,
} from "@/lib/decision/proof";
import {
  RAIN_NORTHSTAR_PROOF_RECEIPT_ID,
  readRainNorthstarAttemptReceipt,
} from "@/lib/integrations/rain/northstar-proof";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const run = buildAtlasFixtureRun();
  const [agentDecision, liveOpenAIProof, liveRainAttempt] = await Promise.all([
    buildAtlasFixtureDecisionAudit(),
    readOpenAIDecisionProof().catch(() => null),
    readRainNorthstarAttemptReceipt().catch(() => null),
  ]);
  const rainAuthorizationAccepted = liveRainAttempt?.operations.some(
    (entry) =>
      entry.operation === "rain.authorize_transaction" &&
      entry.state === "provider-accepted",
  );
  const agentResource = run.offers.find(
    (offer) =>
      offer.id === agentDecision.policyVerification.selectedResourceId,
  );
  const purchased = run.offerResults.filter((result) => result.finalAction === "buy");
  const withheld = run.offerResults.filter((result) => result.finalAction !== "buy");
  const passedChecks = run.evaluation?.checks.filter((check) => check.passed).length ?? 0;
  const totalChecks = run.evaluation?.checks.length ?? 0;

  return (
    <PlatformShell>
      <div className={styles.view}>
        <header className={styles.heading}><div><p className="eyebrow">Audit center</p><h1>Ledger</h1><p>Decisions, provider state, resource delivery, and outcome evidence remain separate facts.</p></div><Link className={styles.primaryLink} href={`/missions/atlas-launch-v1?run=${run.id}`}>Open fixture run</Link></header>
        <div className={styles.disclosure}>Mixed evidence. Live-model and Rain Sandbox records are durable redacted captures; the animated mission, payments, deliveries, and artifact remain synthetic fixtures. Rain settlement is ambiguous and Monad payment is unproven.</div>
        <EvidenceBoundary compact />
        {liveOpenAIProof ? (
          <section className={styles.agentEvidence} id="live-agent-decision-evidence" aria-labelledby="live-agent-decision-title">
            <div>
              <p className="eyebrow">Live bounded model proof</p>
              <h2 id="live-agent-decision-title">{liveOpenAIProof.decision.proposal.action} · {liveOpenAIProof.decision.policyVerification.selectedResourceId ?? "No resource selected"}</h2>
              <p>One protected Preview Responses API call produced strict structured output. Deterministic policy re-verified the proposal; it did not authorize or execute a provider payment.</p>
              <strong>OpenAI live proposal · Durable redacted evidence · Payment state remains separate</strong>
            </div>
            <dl className={styles.agentEvidenceFacts}>
              <div><dt>Model</dt><dd>{liveOpenAIProof.decision.modelId}</dd></div>
              <div><dt>Verified action</dt><dd>{liveOpenAIProof.decision.policyVerification.finalAction}</dd></div>
              <div><dt>Maximum</dt><dd>${(liveOpenAIProof.decision.policyVerification.verifiedMaximumAuthorizedCents / 100).toFixed(2)}</dd></div>
              <div><dt>Tokens</dt><dd>{liveOpenAIProof.decision.usage?.totalTokens ?? "Not reported"}</dd></div>
            </dl>
            <details>
              <summary>Inspect live-model proof and deterministic verification</summary>
              <dl>
                <div><dt>Prompt version</dt><dd>{liveOpenAIProof.decision.promptVersion}</dd></div>
                <div><dt>Input digest</dt><dd className={styles.mono}>{liveOpenAIProof.decision.inputDigest}</dd></div>
                <div><dt>Output digest</dt><dd className={styles.mono}>{liveOpenAIProof.decision.outputDigest}</dd></div>
                <div><dt>Policy rules</dt><dd>{liveOpenAIProof.decision.policyVerification.ruleCodes.join(", ")}</dd></div>
                <div><dt>Truth state</dt><dd>{liveOpenAIProof.decision.truthState.replaceAll("_", " ")}</dd></div>
                <div><dt>Reasoning storage</dt><dd>Concise rationale only; no chain-of-thought stored</dd></div>
              </dl>
              <a download href={`/api/audit/receipts/${OPENAI_DECISION_PROOF_RECEIPT_ID}`}>Download live decision receipt ↓</a>
            </details>
          </section>
        ) : null}
        <section className={styles.agentEvidence} id="agent-decision-evidence" aria-labelledby="agent-decision-title">
          <div>
            <p className="eyebrow">Bounded agent proposal</p>
            <h2 id="agent-decision-title">{agentDecision.proposal.action} · {agentResource?.title ?? "Catalog resource"}</h2>
            <p>A deterministic fixture adapter selected from the fixed catalog. Server policy independently verified the exact quote, budget, vendor, MCC, evidence, duplicate state, and injection signals.</p>
            <strong>Fixture evidence only · No OpenAI API call · No payment authority</strong>
          </div>
          <dl className={styles.agentEvidenceFacts}>
            <div><dt>Model</dt><dd>{agentDecision.modelId}</dd></div>
            <div><dt>Verified action</dt><dd>{agentDecision.policyVerification.finalAction}</dd></div>
            <div><dt>Maximum</dt><dd>${(agentDecision.policyVerification.verifiedMaximumAuthorizedCents / 100).toFixed(2)}</dd></div>
            <div><dt>Truth state</dt><dd>{agentDecision.truthState.replaceAll("_", " ")}</dd></div>
          </dl>
          <details>
            <summary>Inspect prompt version, digest, rationale, and policy rules</summary>
            <dl>
              <div><dt>Prompt version</dt><dd>{agentDecision.promptVersion}</dd></div>
              <div><dt>Input digest</dt><dd className={styles.mono}>{agentDecision.inputDigest}</dd></div>
              <div><dt>Policy rules</dt><dd>{agentDecision.policyVerification.ruleCodes.join(", ")}</dd></div>
              <div><dt>Rationale</dt><dd>{agentDecision.proposal.rationale}</dd></div>
              <div><dt>Reasoning storage</dt><dd>Concise rationale only; no chain-of-thought stored</dd></div>
            </dl>
            <a download href={`/api/audit/receipts/${ATLAS_AGENT_DECISION_RECEIPT_ID}`}>Download fixture decision JSON ↓</a>
          </details>
        </section>
        <section className={styles.providerEvidence} aria-labelledby="provider-evidence-title">
          <div className={styles.sectionLabel}>
            <div>
              <p className="eyebrow">Provider truth</p>
              <h2 id="provider-evidence-title">What the current evidence can support</h2>
            </div>
            <span>Redacted · no secret or raw payload fields</span>
          </div>
          <div className={styles.providerEvidenceGrid}>
            <article id="rain-provider-evidence">
              <div className={styles.cardTop}><span className={`${styles.badge} ${styles.rain}`}>Rain Sandbox</span><span className={`${styles.badge} ${styles.warning}`}>Mixed evidence</span></div>
              <h3>Card and authorization matched; settlement ambiguous</h3>
              <p>A fresh scoped card matched direct readback and Rain accepted a 12-cent authorization. A later exact GET matched every causal field. One settlement POST returned HTTP 400; three bounded exact readbacks stayed nonterminal. SpendForge will not retry and claims no completed spend. Historical funding remains an uncorrelated HTTP 202 acknowledgment.</p>
              <dl className={styles.proofFacts}><div><dt>Funding</dt><dd>Uncorrelated HTTP 202</dd></div><div><dt>Card</dt><dd>Direct readback confirmed</dd></div><div><dt>Authorization</dt><dd>{rainAuthorizationAccepted ? "Provider response accepted" : "Protected Preview record not loaded locally"}</dd></div><div><dt>Settlement</dt><dd>1 POST · HTTP 400 · nonterminal readback</dd></div></dl>
              <strong>Authorization acceptance is not settlement or money movement.</strong>
              {liveRainAttempt ? <a download href={`/api/audit/receipts/${RAIN_NORTHSTAR_PROOF_RECEIPT_ID}`}>Download current redacted Rain attempt ↓</a> : null}
              <a download href="/api/audit/receipts/audit_rain_card_20260808_v2">Download earlier card capture ↓</a>
              <Link href="/missions/atlas-launch-v1?scenario=rain-async">Open the Rain safe-stop view →</Link>
            </article>
            <article id="monad-provider-evidence">
              <div className={styles.cardTop}><span className={`${styles.badge} ${styles.monad}`}>Monad Testnet</span><span className={`${styles.badge} ${styles.warning}`}>Unproven</span></div>
              <h3>Capability passed; no payment reference attached</h3>
              <p>Live /supported advertised x402 v2 exact on Monad Testnet. Preview wallet/test-asset configuration is absent, so no facilitator settlement or chain reference exists and delivery cannot be attributed to payment.</p>
              <dl className={styles.proofFacts}><div><dt>Payment truth</dt><dd>Not established</dd></div><div><dt>Resource delivery</dt><dd>Fixture manifest only</dd></div></dl>
              <strong>A 402 challenge alone would not prove settlement.</strong>
              <Link href="/missions/atlas-launch-v1?scenario=monad-unavailable">Open the unavailable-provider rehearsal →</Link>
            </article>
            <article id="fixture-audit-receipt">
              <div className={styles.cardTop}><span className={styles.badge}>SpendForge</span><span className={`${styles.badge} ${styles.success}`}>Inspectable</span></div>
              <h3>Downloadable fixture receipt</h3>
              <p>The redacted audit export contains the fixture journal, truth boundary, operation states, and masked references. It remains explicitly non-authoritative.</p>
              <dl className={styles.proofFacts}><div><dt>Mode</dt><dd>Fixture</dd></div><div><dt>Redaction</dt><dd>Required</dd></div></dl>
              <strong>Useful for product review; insufficient for sponsor integration proof.</strong>
              <a download href="/api/audit/receipts/audit_atlas_fixture_v1">Download synthetic audit receipt ↓</a>
            </article>
          </div>
        </section>
        <section className={styles.ledgerSummary} aria-label="Ledger summary">
          <article><span>Policy result</span><strong>{purchased.length} permitted</strong><p>{withheld.length} offers declined or blocked before payment.</p></article>
          <article><span>Evidence state</span><strong>{run.payments.length} fixture receipts</strong><p>Non-authoritative records remain visibly separated from delivery.</p></article>
          <article><span>Outcome</span><strong>{passedChecks}/{totalChecks} checks</strong><p>Versioned deterministic evaluator, not a provider assertion.</p></article>
        </section>
        <section className={styles.receiptStack} aria-labelledby="decision-receipts-title">
          <div className={styles.sectionLabel}><h2 id="decision-receipts-title">Decision receipts</h2><span>Expand for provider and delivery fields</span></div>
          {run.offerResults.map((result) => {
            const offer = run.offers.find((entry) => entry.id === result.offerId);
            const payment = run.payments.find((entry) => entry.offerId === result.offerId);
            const delivery = run.deliveries.find((entry) => entry.offerId === result.offerId);
            if (!offer) return null;
            return (
              <details
                className={styles.receiptRow}
                data-testid={payment?.rail === "rain_card" ? "ledger-row-rain" : payment?.rail === "monad_x402" ? "ledger-row-x402" : undefined}
                id={`receipt-${result.offerId}`}
                key={result.offerId}
              >
                <summary>
                  <span><strong>{offer.title}</strong><small>v{result.offerVersion} · {offer.rail.replace("_", " ")}</small></span>
                  <span className={styles.mono}>{formatMoneyAtomic(offer.price)}</span>
                  <span className={`${styles.badge} ${result.finalAction === "buy" ? styles.success : result.finalAction === "block" ? styles.danger : styles.warning}`}>{result.finalAction}</span>
                </summary>
                <dl className={styles.receiptFacts}>
                  <div><dt>Provider state</dt><dd>{payment ? `${payment.providerState} · fixture` : "No payment attempt"}</dd></div>
                  <div><dt>Delivery</dt><dd>{delivery?.state ?? "Not applicable"}</dd></div>
                  <div><dt>Receipt</dt><dd className={styles.mono}>{shortReference(payment?.receipt?.reference)}</dd></div>
                  <div><dt>Evidence authority</dt><dd>{payment?.authoritative ? "Authoritative" : "Synthetic / non-authoritative"}</dd></div>
                </dl>
                <div className={styles.receiptLinks}>
                  <span>{payment ? payment.truthLabel : "No payment attempt exists for this offer."}</span>
                  {payment ? <a download href="/api/audit/receipts/audit_atlas_fixture_v1">Synthetic audit JSON ↓</a> : null}
                  {delivery ? <Link href="/artifacts/atlas-launch-v1">Artifact usage ↗</Link> : null}
                </div>
              </details>
            );
          })}
        </section>
      </div>
    </PlatformShell>
  );
}
