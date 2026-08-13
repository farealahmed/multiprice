import type { Discount, LineInput } from '@/lib/api/types/pricing';

/**
 * Local editor state for one row. `key` is local-only; `id`, when loaded from a
 * document, is echoed back on save. Numeric fields stay as raw input strings
 * so typing is never rewritten under the cursor.
 */
export type RowState = {
  /** Server-minted document-line identity; absent until a new row is saved. */
  id?: string;
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountType: Discount['type'];
  discountValue: string;
  taxPercent: string;
};

export function emptyRow(key: string): RowState {
  return {
    key,
    description: '',
    quantity: '',
    unitPrice: '',
    discountType: 'none',
    discountValue: '',
    taxPercent: '',
  };
}

/**
 * Parses raw input strings into the wire shape. Returns null while any field
 * is mid-edit (empty or non-numeric) — an incomplete row fires no request, so
 * the last server totals stay on screen instead of a guessed number.
 * Parsing input is not arithmetic: no money is computed here.
 */
export function toLineInputs(rows: RowState[]): LineInput[] | null {
  const lines: LineInput[] = [];

  for (const row of rows) {
    const quantity = Number(row.quantity);
    const unitPrice = Number(row.unitPrice);
    if (
      row.quantity.trim() === '' ||
      row.unitPrice.trim() === '' ||
      !Number.isFinite(quantity) ||
      !Number.isFinite(unitPrice)
    ) {
      return null;
    }

    let discount: Discount;
    if (row.discountType === 'none') {
      discount = { type: 'none' };
    } else {
      const value = Number(row.discountValue);
      if (row.discountValue.trim() === '' || !Number.isFinite(value)) {
        return null;
      }
      discount = { type: row.discountType, value };
    }

    const taxPercent = row.taxPercent.trim() === '' ? null : Number(row.taxPercent);
    if (taxPercent !== null && !Number.isFinite(taxPercent)) {
      return null;
    }

    lines.push({ quantity, unitPrice, discount, taxPercent });
  }

  return lines;
}
