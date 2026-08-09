import Link from "next/link";

export default function NotFound() {
  return (
    <main className="centered-message">
      <p className="eyebrow">SpendForge</p>
      <h1>That record is not in this workspace.</h1>
      <p>The Atlas launch mission is the available deterministic demo.</p>
      <Link className="button primary" href="/missions/atlas-launch-v1">
        Open Atlas mission
      </Link>
    </main>
  );
}
