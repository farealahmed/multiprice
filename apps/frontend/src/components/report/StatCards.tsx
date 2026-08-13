/** @jsxRuntime automatic */
/** @jsxImportSource react */

import { formatMoney } from '@/components/money/format-money';
import type { ReportSummary } from '@/lib/api/types/report';
import styles from './report.module.css';

type StatCardsProps = {
  summary: ReportSummary;
};

/**
 * Renders the four summary figures verbatim from the server.
 *
 * Money values are passed through `formatMoney` for display only; no arithmetic
 * happens here.
 */
export function StatCards({ summary }: StatCardsProps) {
  return (
    <div className={styles.statRow}>
      <div className={styles.stat}>
        <div className={styles.statLabel}>Documents</div>
        <div className={styles.statValue}>{summary.documentCount}</div>
        <div className={styles.statSub}>
          {summary.from} → {summary.to}
        </div>
      </div>
      <div className={`${styles.stat} ${styles.hero}`}>
        <div className={styles.statLabel}>Sum of grand totals</div>
        <div className={styles.statValue}>{formatMoney(summary.totalGrandTotal)}</div>
      </div>
      <div className={styles.stat}>
        <div className={styles.statLabel}>Sum of total tax</div>
        <div className={styles.statValue}>{formatMoney(summary.totalTax)}</div>
      </div>
      <div className={styles.stat}>
        <div className={styles.statLabel}>Sum of total discount</div>
        <div className={styles.statValue}>{formatMoney(summary.totalDiscount)}</div>
      </div>
    </div>
  );
}
