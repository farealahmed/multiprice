/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { LineResult } from '@/lib/api/types/pricing';

import type { RowFieldErrors } from './error-mapping';
import styles from './line-items.module.css';
import { LineItemRow } from './LineItemRow';
import type { RowState } from './row-state';

type LineItemsTableProps = {
  rows: RowState[];
  /** Positional match from the last server response (A7); undefined before it lands. */
  results?: LineResult[];
  errors?: Map<number, RowFieldErrors>;
  pending: boolean;
  onChange: (key: string, patch: Partial<RowState>) => void;
  onRemove: (key: string) => void;
};

export function LineItemsTable({ rows, results, errors, pending, onChange, onRemove }: LineItemsTableProps) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.colIndex} scope="col">
            #
          </th>
          <th scope="col">Description</th>
          <th className={`${styles.headNum} ${styles.colQty}`} scope="col">
            Qty
          </th>
          <th className={`${styles.headNum} ${styles.colPrice}`} scope="col">
            Unit price
          </th>
          <th className={styles.colDiscount} scope="col">
            Discount
          </th>
          <th className={`${styles.headNum} ${styles.colTax}`} scope="col">
            Tax %
          </th>
          <th className={`${styles.headNum} ${styles.colMoney}`} scope="col">
            Subtotal
          </th>
          <th className={`${styles.headNum} ${styles.colMoney}`} scope="col">
            Disc. amt
          </th>
          <th className={`${styles.headNum} ${styles.colMoney}`} scope="col">
            Tax amt
          </th>
          <th className={`${styles.headNum} ${styles.colTotal}`} scope="col">
            Line total
          </th>
          <th className={styles.colRemove} scope="col">
            <span className={styles.visuallyHidden}>Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <LineItemRow
            key={row.key}
            index={index}
            lineId={row.id}
            row={row}
            result={results?.[index]}
            errors={errors?.get(index)}
            pending={pending}
            onChange={onChange}
            onRemove={onRemove}
          />
        ))}
      </tbody>
    </table>
  );
}
