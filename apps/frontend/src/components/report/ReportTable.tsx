/** @jsxRuntime automatic */
/** @jsxImportSource react */

import { formatMoney } from '@/components/money/format-money';
import { StatusPill } from '@/components/documents/StatusPill';
import type { DocumentSummary } from '@/lib/api/types/document';
import styles from './report.module.css';

type ReportTableProps = {
  docs: DocumentSummary[];
};

/**
 * Lists every document in the selected range.
 *
 * This is a read-only view: no row actions and no client-side arithmetic.
 */
export function ReportTable({ docs }: ReportTableProps) {
  return (
    <table className={styles.grid}>
      <thead>
        <tr>
          <th>Title</th>
          <th>Customer</th>
          <th>Issue date</th>
          <th>Status</th>
          <th className={styles.r}>Subtotal</th>
          <th className={styles.r}>Discount</th>
          <th className={styles.r}>Tax</th>
          <th className={styles.r}>Grand total</th>
        </tr>
      </thead>
      <tbody>
        {docs.map((doc) => (
          <tr key={doc.id}>
            <td>{doc.title}</td>
            <td>{doc.customer}</td>
            <td className={styles.num}>{doc.issueDate}</td>
            <td>
              <StatusPill status={doc.status} />
            </td>
            <td className={`${styles.r} ${styles.num}`}>
              {formatMoney(doc.totals.subtotal)}
            </td>
            <td className={`${styles.r} ${styles.num}`}>
              {formatMoney(doc.totals.totalDiscount)}
            </td>
            <td className={`${styles.r} ${styles.num}`}>
              {formatMoney(doc.totals.totalTax)}
            </td>
            <td className={`${styles.r} ${styles.num}`}>
              {formatMoney(doc.totals.grandTotal)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
