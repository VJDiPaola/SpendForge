import Link from "next/link";

import { EvidenceBoundary } from "./evidence-boundary";
import styles from "./landing-page.module.css";

const operatingLoop = [
  ["01", "Mission", "An operator sets the objective, budget, deadline, and hard limits once."],
  ["02", "Decide", "A bounded model proposes one fixed-catalog purchase; typed policy code verifies or overrides it."],
  ["03", "Transact", "An allowed purchase uses the seller's native Rain card or Monad x402 rail."],
  ["04", "Prove", "Provider truth, delivery hashes, and outcome checks stay separate in one audit trail."],
] as const;

export function LandingPage() {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/" aria-label="SpendForge home">
          <span aria-hidden="true">SF</span>
          SpendForge
        </Link>
        <nav aria-label="Product navigation">
          <Link href="/missions">Missions</Link>
          <Link href="/ledger">Proof ledger</Link>
          <Link href="/policies">Controls</Link>
        </nav>
        <span className={styles.fixtureTag}>Live model proof + fixture walkthrough</span>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className="eyebrow">Autonomous microprocurement</p>
          <h1>Let agents buy small digital resources. Make every step prove itself.</h1>
          <p>
            SpendForge is for low-value, preapproved, machine-deliverable resources—API access, dataset slices,
            compute, and digital licenses—inside a human-set mandate. It keeps proposal, policy, payment,
            delivery, and outcome evidence distinct.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} href="/missions/atlas-launch-v1">
              Open fixture walkthrough
            </Link>
            <Link className={styles.secondaryAction} href="/missions/atlas-launch-v1?scenario=rain-async">
              Inspect Rain safe-stop
            </Link>
          </div>
          <small>
            Synthetic mission and catalog. Rain is sandbox-only; Monad is testnet-only. No production funds
            are represented.
          </small>
        </div>

        <aside className={styles.receipt} aria-label="Current proof summary">
          <div className={styles.receiptTop}>
            <span>Proof posture</span>
            <strong>Build evidence</strong>
          </div>
          <div className={styles.receiptStatus}>
            <span>Agent decision</span>
            <strong>One live bounded proposal</strong>
            <p>OpenAI proposed Pulse at a one-cent maximum; deterministic policy verified it. No payment authority was granted.</p>
          </div>
          <div className={styles.receiptStatus}>
            <span>Rain Sandbox</span>
            <strong>Authorization accepted; spend unproven</strong>
            <p>A card and authorization matched. One settlement POST returned HTTP 400 and three exact readbacks stayed nonterminal, so no completed spend is claimed.</p>
          </div>
          <div className={styles.receiptStatus}>
            <span>Monad Testnet</span>
            <strong>Capability passed; payment unproven</strong>
            <p>Live /supported advertised v2 exact. No wallet, payment, chain receipt, or paid delivery occurred.</p>
          </div>
          <Link href="/ledger">Review the audit ledger →</Link>
        </aside>
      </section>

      <EvidenceBoundary compact />

      <section className={styles.loop} id="architecture" aria-labelledby="loop-title">
        <div className={styles.sectionHeading}>
          <p className="eyebrow">One outcome loop</p>
          <h2 id="loop-title">The agent can act. The evidence decides what we may claim.</h2>
        </div>
        <div className={styles.loopGrid}>
          {operatingLoop.map(([number, title, detail]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.boundaryMap} aria-label="Provider responsibility map">
        <div>
          <span>SpendForge owns</span>
          <strong>Mission · decision · delivery evidence · outcome</strong>
        </div>
        <i aria-hidden="true">→</i>
        <div>
          <span>Providers own</span>
          <strong>Rain controls · x402 verification · settlement truth</strong>
        </div>
        <Link href="/policies">See the boundary</Link>
      </section>

      <section className={styles.boundaryMap} aria-label="Product scope boundary">
        <div>
          <span>Designed for</span>
          <strong>APIs · datasets · compute · metered tools · digital licenses</strong>
        </div>
        <i aria-hidden="true">≠</i>
        <div>
          <span>Not a replacement for</span>
          <strong>Contracts · tax/legal review · vendor onboarding · renewals</strong>
        </div>
        <Link href="/policies">Review the mandate</Link>
      </section>
    </main>
  );
}
