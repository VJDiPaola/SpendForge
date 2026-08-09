import type { Metadata } from "next";
import Link from "next/link";

import { buildAtlasFixtureRun } from "@/lib/demo";

import styles from "./artifact.module.css";

export const metadata: Metadata = {
  title: "Atlas launch artifact",
  description: "The synthetic Atlas launch artifact composed from vetted demo resource manifests.",
};

export default function AtlasArtifactPage() {
  const run = buildAtlasFixtureRun();
  const passedChecks = run.evaluation?.checks.filter((check) => check.passed).length ?? 0;
  const totalChecks = run.evaluation?.checks.length ?? 0;

  return (
    <main className={styles.page}>
      <div className={styles.truthBar}>
        <strong>Synthetic Atlas artifact</strong>
        <span>Real rendered route · Seeded manifests · Fixture payment evidence</span>
        <div className={styles.truthLinks}><Link href={`/missions/atlas-launch-v1?run=${run.id}`}>Mission receipt ↗</Link><Link href="/ledger">Proof ledger ↗</Link></div>
      </div>

      <nav className={styles.nav} aria-label="Atlas artifact navigation">
        <span className={styles.wordmark}>ATLAS</span>
        <div><span>Model</span><span>Evidence</span><span>Controls</span></div>
        <span className={styles.navCta}>Explore Atlas</span>
      </nav>

      <section className={styles.hero}>
        <div className={styles.orbit} aria-hidden="true"><span /><span /><span /></div>
        <div className={styles.heroCopy}>
          <p>Agent operations infrastructure</p>
          <h1>Autonomy you can inspect.</h1>
          <span className={styles.subhead}>Give every agent a clear mission, bounded authority, and a trail of evidence your team can actually use.</span>
          <div className={styles.actions}><span>See the operating model</span><span>Review the evidence →</span></div>
        </div>
        <div className={styles.signalCard}>
          <span>ACTIVE MISSION</span>
          <strong>Launch readiness</strong>
          <div><i /><p>Mandate locked<small>Scope and authority recorded</small></p></div>
          <div><i /><p>Work observable<small>Decisions become events</small></p></div>
          <div><i /><p>Fixture checks passed<small>{passedChecks}/{totalChecks} deterministic checks</small></p></div>
        </div>
      </section>

      <section className={styles.capabilities} aria-labelledby="capabilities-title">
        <div className={styles.sectionIntro}>
          <p>THE OPERATING LAYER</p>
          <h2 id="capabilities-title">Move fast without losing the thread.</h2>
        </div>
        <div className={styles.cards}>
          {[
            ["01", "Mandates", "Define the job, limits, and finish line before autonomous work begins."],
            ["02", "Signals", "Follow decisions, tool use, and exceptions in one operational view."],
            ["03", "Evidence", "Connect every output to its source, receipt, and measurable result."],
          ].map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
              <i aria-hidden="true">↗</i>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.proofStrip} aria-label="Artifact evidence boundary">
        <article><span>Artifact route</span><strong>Rendered in SpendForge</strong><p>This page and its responsive composition are inspectable product output.</p></article>
        <article><span>Source resources</span><strong>Seeded fixture manifests</strong><p>Pulse v1 and Northstar v1 are synthetic programmatic resources with recorded fixture hashes.</p></article>
        <article><span>Payment evidence</span><strong>Not provider-authoritative</strong><p>No Rain settled card readback or Monad testnet reference is attached to this artifact.</p></article>
      </section>

      <footer className={styles.footer}>
        <span>Built by a synthetic SpendForge mission.</span>
        <span>Pulse manifest v1 · Northstar licensed background v1</span>
      </footer>
    </main>
  );
}
