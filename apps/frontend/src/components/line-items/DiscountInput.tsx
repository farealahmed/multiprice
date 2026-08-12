/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { Discount } from '@/lib/api/types/pricing';

import styles from './line-items.module.css';

type DiscountInputProps = {
  /** Accessible-name prefix, e.g. "Row 2". */
  rowLabel: string;
  type: Discount['type'];
  value: string;
  error?: string;
  onTypeChange: (type: Discount['type']) => void;
  onValueChange: (value: string) => void;
};

/**
 * Type-select mirroring the wire's discriminated union (R10): percent and
 * fixed can never coexist, because the value input only exists for the
 * selected type and switching types clears it. Thin and controlled — all
 * state, including any server error, lives in the parent.
 */
export function DiscountInput({
  rowLabel,
  type,
  value,
  error,
  onTypeChange,
  onValueChange,
}: DiscountInputProps) {
  return (
    <div className={styles.discount}>
      <div className={styles.discountControls}>
        <select
          aria-label={`${rowLabel} discount type`}
          className={styles.input}
          value={type}
          onChange={(event) => onTypeChange(event.target.value as Discount['type'])}
        >
          <option value="none">— none —</option>
          <option value="percent">% percent</option>
          <option value="fixed">$ fixed</option>
        </select>
        {type !== 'none' && (
          <input
            aria-label={`${rowLabel} discount value`}
            className={`${styles.input} ${styles.numInput}`}
            type="number"
            min="0"
            max={type === 'percent' ? 100 : undefined}
            step="0.01"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
          />
        )}
      </div>
      {error !== undefined && (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
