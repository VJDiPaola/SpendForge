import { formatMoneyAtomic } from "@/components/presentation";
import { PlatformShell } from "@/components/platform-shell";
import styles from "@/components/record-view.module.css";
import { buildAtlasFixtureRun } from "@/lib/demo";

export default function CatalogPage() {
  const run = buildAtlasFixtureRun();
  return (
    <PlatformShell>
      <div className={styles.view}>
        <header className={styles.heading}><div><p className="eyebrow">Normalized inventory</p><h1>Resource catalog</h1><p>Each seeded offer keeps its native checkout rail, provenance, license, and delivery contract.</p></div></header>
        <div className={styles.disclosure}>Supplier names and catalog inventory are synthetic. Payment rails shown here are integration boundaries, not completed provider transactions.</div>
        <section className={styles.cardGrid} aria-label="Available resource offers">
          {run.offers.map((offer) => {
            const result = run.offerResults.find((entry) => entry.offerId === offer.id);
            const stateClass = result?.finalAction === "buy" ? styles.success : result?.finalAction === "block" ? styles.danger : styles.warning;
            const railClass = offer.rail === "rain_card" ? styles.rain : offer.rail === "monad_x402" ? styles.monad : "";
            const railLabel = offer.rail === "rain_card" ? "Rain Sandbox candidate" : offer.rail === "monad_x402" ? "Monad Testnet candidate" : "No payment rail";
            const decisionLabel = result?.finalAction === "buy" ? "Fixture permitted" : result?.finalAction === "block" ? "Fixture blocked" : "Fixture declined";
            return (
              <article className={styles.card} key={offer.id}>
                <div><div className={styles.cardTop}><span className={`${styles.badge} ${railClass}`}>{railLabel}</span><span className={`${styles.badge} ${stateClass}`}>{decisionLabel}</span></div><h2>{offer.title}</h2><p>{offer.description}</p></div>
                <div className={styles.priceLine}><span>Offer amount</span><strong className={styles.mono}>{formatMoneyAtomic(offer.price)}</strong></div>
                <p className={styles.railTruth}>{offer.rail === "free" ? "No provider payment is required." : `Target checkout rail only. This catalog card contains no ${offer.rail === "rain_card" ? "Rain card readback" : "Monad transaction reference"}.`}</p>
                <details className={styles.cardDetails}><summary>Resource details</summary><dl className={styles.facts}>
                  <div><dt>Seller</dt><dd>{offer.seller.displayName} · Synthetic</dd></div><div><dt>Price</dt><dd className={styles.mono}>{formatMoneyAtomic(offer.price)}</dd></div>
                  <div><dt>License</dt><dd>{offer.license.label}</dd></div><div><dt>Delivery</dt><dd>{offer.deliveryType}</dd></div>
                  <div><dt>Provenance</dt><dd>{offer.provenance}</dd></div><div><dt>Version</dt><dd>v{offer.version}</dd></div>
                </dl></details>
              </article>
            );
          })}
        </section>
      </div>
    </PlatformShell>
  );
}
