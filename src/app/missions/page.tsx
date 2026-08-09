import Link from "next/link";

import { PlatformShell } from "@/components/platform-shell";

import styles from "@/components/record-view.module.css";

const missions = [
  { title: "Atlas launch page", status: "Ready", budget: "$0.25", spent: "$0.00", outcome: "Not run", label: "Synthetic", href: "/missions/atlas-launch-v1" },
  { title: "Regression test acquisition", status: "Sample complete", budget: "$1.50", spent: "$0.42", outcome: "8/8 sample checks", label: "Sample record" },
  { title: "Supplier recovery", status: "Template", budget: "Not set", spent: "$0.00", outcome: "Not configured", label: "Synthetic template" },
] as const;

export default function MissionsPage() {
  return (
    <PlatformShell>
      <div className={styles.view}>
        <header className={styles.heading}>
          <div><p className="eyebrow">Mission operations</p><h1>Missions</h1><p>Bounded purchasing work with receipts, delivery evidence, and measurable outcomes.</p></div>
          <Link className={styles.primaryLink} href="/missions/atlas-launch-v1">Open Atlas mission</Link>
        </header>
        <div className={styles.disclosure}>All records on this screen are synthetic fixtures or labeled samples. Rain Sandbox and Monad Testnet are target rails, not proof that these records transacted.</div>
        <div className={styles.tableSurface}>
          <table className={styles.table}>
            <thead><tr><th>Mission</th><th>Status</th><th>Budget</th><th>Spent</th><th>Outcome</th><th>Environment</th><th /></tr></thead>
            <tbody>
              {missions.map((mission) => (
                <tr key={mission.title}>
                  <td>{mission.title}<br /><span className={styles.badge}>{mission.label}</span></td>
                  <td><span className={`${styles.badge} ${mission.status.includes("complete") ? styles.success : styles.warning}`}>{mission.status}</span></td>
                  <td className={styles.mono}>{mission.budget}</td><td className={styles.mono}>{mission.spent}</td><td>{mission.outcome}</td><td><span className={styles.badge}>Fixture record</span><br /><small>Target: Rain Sandbox + Monad Testnet</small></td>
                  <td>{"href" in mission ? <Link href={mission.href}>Open fixture →</Link> : <span>View only</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PlatformShell>
  );
}
