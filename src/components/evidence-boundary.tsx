import styles from "./evidence-boundary.module.css";

type EvidenceBoundaryProps = {
  compact?: boolean;
};

const evidenceRows = [
  {
    label: "This record",
    state: "Fixture",
    tone: "fixture",
    detail: "Synthetic mission data and non-authoritative receipts for the product walkthrough.",
  },
  {
    label: "Agent proposal",
    state: "Live proof available",
    tone: "agent",
    detail: "One bounded OpenAI Responses call produced strict output and was rechecked by deterministic policy. It did not authorize payment.",
  },
  {
    label: "Rain Sandbox",
    state: "Partial evidence",
    tone: "rain",
    detail: "Card and authorization evidence matched. One settlement POST returned HTTP 400 and three readbacks stayed nonterminal; no completed spend is claimed.",
  },
  {
    label: "Monad Testnet",
    state: "Capability only",
    tone: "monad",
    detail: "Live /supported advertised Monad v2 exact, but no wallet, payment, chain receipt, or paid delivery occurred.",
  },
] as const;

export function EvidenceBoundary({ compact = false }: EvidenceBoundaryProps) {
  return (
    <section
      aria-label="Evidence boundary"
      className={`${styles.boundary} ${compact ? styles.compact : ""}`}
      data-testid="truth-boundary"
    >
      <div className={styles.intro}>
        <span>Evidence boundary</span>
        <strong>Know what is proved before you trust the receipt.</strong>
      </div>
      <div className={styles.rows}>
        {evidenceRows.map((row) => (
          <article className={styles[row.tone]} key={row.label}>
            <div>
              <span>{row.label}</span>
              <strong>{row.state}</strong>
            </div>
            <p>{row.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
