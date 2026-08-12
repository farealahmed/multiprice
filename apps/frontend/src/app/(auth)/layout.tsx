/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Suspense, type ReactNode } from 'react';

import { SessionProvider } from '@/lib/auth/session-context';

import styles from './auth.module.css';

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <SessionProvider>
      <div className={styles.wrap}>
        <aside className={styles.aside}>
          <div>
            <div className={styles.brand}>
              <span aria-hidden="true" className={styles.brandMark}>
                {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
              </span>
              <span>Tallymark</span>
            </div>
            <div className={styles.introduction}>
              <p className={styles.tag}>Multi-Rate Pricing Calculator</p>
              <h1>
                Every line priced.<br />
                Every discount <em>before</em> tax.<br />
                Every total exact.
              </h1>
              <p className={styles.fine}>
                Documents with per-line discounts and tax rules, a strict draft → finalized lifecycle, and summary reporting across any date range.
              </p>
            </div>
          </div>
          <p className={styles.foot}>Rounding: half-up · 2 decimals per line</p>
          <svg aria-hidden="true" className={styles.deco} fill="none" height="340" viewBox="0 0 340 340" width="340">
            <path d="M20 320 C 90 200, 150 260, 220 140 S 320 60, 340 20" className={styles.decoAccent} />
            <path d="M0 300 C 80 180, 160 240, 230 120 S 330 40, 360 0" className={styles.decoSand} />
            <rect className={styles.decoBackground} height="10" width="10" x="52" y="238" />
            <rect className={styles.decoAccentFill} height="10" width="10" x="212" y="132" />
            <rect className={styles.decoBackground} height="10" width="10" x="292" y="52" />
          </svg>
        </aside>
        <main className={styles.main}>
          <Suspense fallback={null}>{children}</Suspense>
        </main>
      </div>
    </SessionProvider>
  );
}
