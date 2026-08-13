/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { ReactNode } from 'react';

import { Money } from '@/components/money/Money';
import type { LineResult } from '@/lib/api/types/pricing';

import { DiscountInput } from './DiscountInput';
import type { RowFieldErrors } from './error-mapping';
import styles from './line-items.module.css';
import type { RowState } from './row-state';

type LineItemRowProps = {
  index: number;
  lineId?: string;
  row: RowState;
  /** Positional match from the last server response; undefined before it lands. */
  result?: LineResult;
  errors?: RowFieldErrors;
  pending: boolean;
  disabled?: boolean;
  onChange: (key: string, patch: Partial<RowState>) => void;
  onRemove: (key: string) => void;
};

export function LineItemRow({ index, lineId, row, result, errors, pending, disabled, onChange, onRemove }: LineItemRowProps) {
  const patch = (value: Partial<RowState>) => onChange(row.key, value);
  const rowLabel = `Row ${index + 1}`;

  const resultCell = (render: (line: LineResult) => ReactNode, strong?: boolean) => (
    <td
      className={strong === true ? `${styles.resultCell} ${styles.lineTotal}` : styles.resultCell}
      data-pending={pending || undefined}
    >
      {result === undefined ? '—' : render(result)}
    </td>
  );

  return (
    <tr data-line-id={lineId}>
      <td className={styles.numCell}>{index + 1}</td>
      <td>
        <input
          aria-label={`${rowLabel} description`}
          className={styles.input}
          type="text"
          value={row.description}
          disabled={disabled}
          onChange={(event) => patch({ description: event.target.value })}
        />
        {errors?.row !== undefined && (
          <p className={styles.fieldError} role="alert">
            {errors.row}
          </p>
        )}
      </td>
      <td>
        <input
          aria-label={`${rowLabel} quantity`}
          className={`${styles.input} ${styles.numInput}`}
          type="number"
          min="1"
          step="0.001"
          value={row.quantity}
          disabled={disabled}
          onChange={(event) => patch({ quantity: event.target.value })}
        />
        {errors?.quantity !== undefined && (
          <p className={styles.fieldError} role="alert">
            {errors.quantity}
          </p>
        )}
      </td>
      <td>
        <input
          aria-label={`${rowLabel} unit price`}
          className={`${styles.input} ${styles.numInput}`}
          type="number"
          min="0"
          step="0.01"
          value={row.unitPrice}
          disabled={disabled}
          onChange={(event) => patch({ unitPrice: event.target.value })}
        />
        {errors?.unitPrice !== undefined && (
          <p className={styles.fieldError} role="alert">
            {errors.unitPrice}
          </p>
        )}
      </td>
      <td>
        <DiscountInput
          rowLabel={rowLabel}
          type={row.discountType}
          value={row.discountValue}
          error={errors?.discount}
          disabled={disabled}
          onTypeChange={(discountType) => patch({ discountType, discountValue: '' })}
          onValueChange={(discountValue) => patch({ discountValue })}
        />
      </td>
      <td>
        <input
          aria-label={`${rowLabel} tax percent`}
          className={`${styles.input} ${styles.numInput}`}
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={row.taxPercent}
          disabled={disabled}
          onChange={(event) => patch({ taxPercent: event.target.value })}
        />
        {errors?.taxPercent !== undefined && (
          <p className={styles.fieldError} role="alert">
            {errors.taxPercent}
          </p>
        )}
      </td>
      {resultCell((line) => <Money value={line.subtotal} />)}
      {resultCell((line) => <Money value={line.discountAmount} />)}
      {resultCell((line) => <Money value={line.taxAmount} />)}
      {resultCell((line) => <Money value={line.total} />, true)}
      <td>
        <button
          aria-label={`Remove ${rowLabel.toLowerCase()}`}
          className={styles.textlink}
          type="button"
          disabled={disabled}
          onClick={() => onRemove(row.key)}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}
