/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { ReactNode } from 'react';

import { Money } from '@/components/money/Money';
import type { DocumentResult } from '@/lib/api/types/pricing';

import styles from './line-items.module.css';

type DocumentTotalsProps = {
  /** The last server response; undefined until the first one lands. */
  result?: DocumentResult;
  /** True while the server has not yet answered for the current inputs. */
  pending: boolean;
  /** Why the shown totals are not current (in flight, invalid input, …). */
  note?: string;
};

/**
 * Renders the server's document rollups — and only the server's. Before the
 * first response every cell is an em dash; while a request is in flight the
 * previous values stay visible, dimmed (A8 — never a client-computed guess).
 */
export function DocumentTotals({ result, pending, note }: DocumentTotalsProps) {
  const value = (render: (totals: DocumentResult) => ReactNode, prefix: string) =>
    result === undefined ? (
      '—'
    ) : (
      <>
        {prefix}
        {render(result)}
      </>
    );

  return (
    <div className={styles.totals} data-pending={pending || undefined}>
      <div className={styles.sectionLabel}>Document totals</div>
      <div className={styles.trow}>
        <span className={styles.tl}>Subtotal</span>
        <span className={styles.tv}>{value((t) => <Money value={t.subtotal} />, '$')}</span>
      </div>
      <div className={styles.trow}>
        <span className={styles.tl}>Total discount</span>
        <span className={styles.tv}>{value((t) => <Money value={t.totalDiscount} />, '− $')}</span>
      </div>
      <div className={styles.trow}>
        <span className={styles.tl}>Total tax</span>
        <span className={styles.tv}>{value((t) => <Money value={t.totalTax} />, '+ $')}</span>
      </div>
      <div className={`${styles.trow} ${styles.grand}`}>
        <span className={styles.tl}>Grand total</span>
        <span className={styles.tv}>{value((t) => <Money value={t.grandTotal} />, '$')}</span>
      </div>
      {note !== undefined && (
        <p className={styles.pendingNote} role="status">
          {note}
        </p>
      )}
    </div>
  );
}
