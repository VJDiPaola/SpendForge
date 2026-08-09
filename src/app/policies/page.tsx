import { EvidenceBoundary } from "@/components/evidence-boundary";
import { formatMoneyAtomic } from "@/components/presentation";
import { PlatformShell } from "@/components/platform-shell";
import styles from "@/components/record-view.module.css";
import type { HumanApprovalRequest } from "@/lib/checkout";
import { buildAtlasFixtureRun } from "@/lib/demo";

const approvalFixture: HumanApprovalRequest = {
  approvalId: "approval:fixture:ocr-quote:v1",
  checkoutId: "checkout:fixture:ocr-quote",
  merchant: {
    id: "merchant:acme-ocr-sandbox",
    displayName: "Acme OCR Sandbox",
    domain: "checkout.acme-ocr.example",
    category: "ocr_api",
  },
  resource: { id: "resource:ocr-100-pages", title: "100-page OCR API pack" },
  amount: { amountAtomic: "8", asset: "USD", decimals: 2 },
  reason: ["NEW_TERMS", "IRREVERSIBLE_COMMIT"],
  policy: {
    mandateId: "mandate:atlas:fixture",
    mandateVersion: 1,
    acceptedTermsVersion: "terms-v1",
    quotedTermsVersion: "terms-v2",
    recurringAllowedByMandate: false,
    ruleCodes: ["POLICY_OK"],
  },
  requestedAt: "2026-08-09T08:00:00.000Z",
  expiry: "2026-08-09T08:05:00.000Z",
  status: "pending",
};

export default function PoliciesPage() {
  const mandate = buildAtlasFixtureRun().mandate;
  return (
    <PlatformShell>
      <div className={styles.view}>
        <header className={styles.heading}><div><p className="eyebrow">Authority boundaries</p><h1>Policies</h1><p>SpendForge decides whether this mission should buy. Rain and the x402 stack remain authoritative for whether a transaction executes.</p></div></header>
        <EvidenceBoundary compact />
        <div className={styles.twoColumn}>
          <section className={styles.panel}><p className="eyebrow">SpendForge mandate</p><h2>Objective-level constraints</h2><p>Deterministic code applies these rules before a typed provider adapter can be invoked.</p><details className={styles.ruleDisclosure}><summary>View 6 mandate rules</summary><ul className={styles.ruleList}><li>Total normalized demo budget: {formatMoneyAtomic(mandate.totalBudget)}</li><li>Per-purchase cap: {formatMoneyAtomic(mandate.perPurchaseCap)}</li><li>Allowed types: {mandate.allowedResourceTypes.join(", ")}</li><li>Allowed licenses: {mandate.allowedLicenseUsages.join(", ")}</li><li>Confidence threshold: 0.85, followed by every hard rule</li><li>Unknown, injected, or executable resources cannot reach payment</li></ul></details></section>
          <section className={styles.panel}><p className="eyebrow">Provider enforcement</p><h2>Infrastructure truth</h2><p>SpendForge consumes provider controls and receipts. It does not recreate card issuance, authorization, x402 verification, wallets, facilitators, or settlement.</p><details className={styles.ruleDisclosure}><summary>View 6 provider boundaries</summary><ul className={styles.ruleList}><li>Rain scoped card and card controls remain Rain-owned</li><li>Rain settlement appears only after authoritative readback</li><li>x402 payment requirements and verification remain protocol-owned</li><li>Monad transaction evidence requires facilitator or chain receipt</li><li>Provider denial remains final for an attempt</li><li>Fixture evidence can never satisfy a live integration gate</li></ul></details></section>
        </div>
        <section className={styles.gateSection} aria-labelledby="execution-gates-title">
          <div className={styles.sectionLabel}><div><p className="eyebrow">Mutation safety</p><h2 id="execution-gates-title">Required before a provider call</h2></div><span>Typed server gate · never delegated to the model</span></div>
          <div className={styles.gateGrid}>
            <article><span>01</span><strong>Provider kill switch</strong><p>Rain and Monad execution can be disabled independently without changing the mission record.</p></article>
            <article><span>02</span><strong>Integer spend cap</strong><p>The provider-specific sandbox or testnet cap must cover the exact atomic amount.</p></article>
            <article><span>03</span><strong>One-attempt gate</strong><p>One explicitly authorized mutation is permitted for the current operation generation.</p></article>
            <article><span>04</span><strong>Durable duplicate gate</strong><p>A database-backed compare-and-set journal is required before any provider window can reopen. The completed demo operations are also statically blocked.</p></article>
          </div>
          <p className={styles.gateTruth}>The Preview provider-operation journal is wired and its restricted-role CAS behavior is proven with synthetic entries. Provider gates remain closed; canonical run persistence and cumulative budget reservations are separate prerequisites for a full autonomous flow.</p>
        </section>
        <section className={styles.agentEvidence} data-testid="approval-inbox" aria-labelledby="approval-inbox-title">
          <div>
            <p className="eyebrow">Approval Inbox · deterministic fixture</p>
            <h2 id="approval-inbox-title">Review required · {approvalFixture.resource.title}</h2>
            <p>{approvalFixture.merchant.displayName} quoted $0.08, but its terms version changed and the next action would be irreversible. The agent may not resume until an authenticated decision is durably journaled.</p>
            <strong>No Slack/email message sent · No checkout submitted · Timeout defaults to reject</strong>
          </div>
          <dl className={styles.agentEvidenceFacts}>
            <div><dt>Merchant</dt><dd>{approvalFixture.merchant.displayName}</dd></div>
            <div><dt>Amount</dt><dd>$0.08 USD</dd></div>
            <div><dt>Reason</dt><dd>New terms + final commit</dd></div>
            <div><dt>Expiry</dt><dd>5-minute fixture window</dd></div>
          </dl>
          <details>
            <summary>Review approval request</summary>
            <dl>
              <div><dt>Policy context</dt><dd>Domain/category allowlisted; integer caps passed; recurrence disabled</dd></div>
              <div><dt>Terms</dt><dd>{approvalFixture.policy.acceptedTermsVersion} accepted; {approvalFixture.policy.quotedTermsVersion} quoted</dd></div>
              <div><dt>Real deployment</dt><dd>Authenticated, append-once approval event before resume</dd></div>
              <div><dt>Delivery channels</dt><dd>Future Slack interactive message or signed email link</dd></div>
            </dl>
            <div className={styles.approvalActions} aria-label="Fixture approval states">
              <span>Review</span>
              <button disabled type="button">Approve · demo only</button>
              <button disabled type="button">Reject · demo only</button>
            </div>
          </details>
        </section>
        <div className={styles.disclosure}>Disclosed demo-supplier mode is narrow and offer-specific. It does not grant a general self-dealing bypass.</div>
      </div>
    </PlatformShell>
  );
}
