"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import styles from "./platform-shell.module.css";

const navigation = [
  { href: "/missions", label: "Missions", glyph: "M" },
  { href: "/catalog", label: "Resource catalog", glyph: "C" },
  { href: "/ledger", label: "Ledger", glyph: "L" },
  { href: "/policies", label: "Policies", glyph: "P" },
] as const;

function isCurrentPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PlatformShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();

  return (
    <div className={styles.shell}>
      <aside className={styles.rail} aria-label="Primary navigation">
        <Link className={styles.brand} href="/missions/atlas-launch-v1" aria-label="SpendForge mission control">
          <span className={styles.brandMark} aria-hidden="true">
            SF
          </span>
          <span className={styles.brandWord}>SpendForge</span>
        </Link>

        <nav className={styles.nav} aria-label="Workspace">
          {navigation.map((item) => {
            const current = isCurrentPath(pathname, item.href);
            return (
              <Link
                aria-current={current ? "page" : undefined}
                className={`${styles.navItem} ${current ? styles.navItemActive : ""}`}
                href={item.href}
                key={item.href}
              >
                <span className={styles.navGlyph} aria-hidden="true">
                  {item.glyph}
                </span>
                <span className={styles.navLabel}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.truthBlock} title="Environment labels only; provider proof is record-specific">
          <p>Provider environments</p>
          <div className={styles.truthRow} data-testid="environment-rain">
            <span className={`${styles.truthDot} ${styles.rainDot}`} />
            <span>Rain Sandbox</span>
          </div>
          <div className={styles.truthRow} data-testid="environment-monad">
            <span className={`${styles.truthDot} ${styles.monadDot}`} />
            <span>Monad Testnet</span>
          </div>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.mobileBrand}>SF</span>
            <span className={styles.workspaceName}>Atlas Demo Workspace</span>
            <span className={styles.syntheticTag}>Synthetic</span>
          </div>
          <div className={styles.health} aria-label="Viewing a fixture product record; provider proof is separate">
            <span className={styles.healthDot} />
            <span>Fixture record · proof separated</span>
          </div>
        </header>

        <div className={styles.mobileTruth} aria-label="Provider environments">
          <span>Rain Sandbox</span>
          <span>Monad Testnet</span>
          <strong>Fixture screen · proof is record-specific</strong>
        </div>

        <main className={styles.content}>{children}</main>
      </section>
    </div>
  );
}
