import { describe, expect, it } from 'vitest';

import { mapPricingErrors } from './error-mapping';

const detail = (path: string, message: string) => ({ path, code: 'X', message });

describe('mapPricingErrors', () => {
  it('attaches known field paths to their row and input', () => {
    const mapped = mapPricingErrors(
      [
        detail('lines.0.quantity', 'Quantity must be at least 1.'),
        detail('lines.1.unitPrice', 'Unit price must not be negative.'),
        detail('lines.1.discount.value', 'Discount percent must be 0–100.'),
        detail('lines.2.taxPercent', 'Tax percent must be 0–100.'),
      ],
      3,
    );

    expect(mapped.rows.get(0)).toEqual({ quantity: 'Quantity must be at least 1.' });
    expect(mapped.rows.get(1)).toEqual({
      unitPrice: 'Unit price must not be negative.',
      discount: 'Discount percent must be 0–100.',
    });
    expect(mapped.rows.get(2)).toEqual({ taxPercent: 'Tax percent must be 0–100.' });
    expect(mapped.documentLevel).toEqual([]);
  });

  it('treats a path without a known field as row-level', () => {
    const mapped = mapPricingErrors([detail('lines.1', 'Discount exceeds subtotal.')], 2);

    expect(mapped.rows.get(1)).toEqual({ row: 'Discount exceeds subtotal.' });
  });

  it('falls back to document level for paths that match no rendered row', () => {
    const mapped = mapPricingErrors(
      [detail('lines.7.taxPercent', 'Tax percent must be 0–100.'), detail('lines', 'Too many lines.')],
      1,
    );

    expect(mapped.rows.size).toBe(0);
    expect(mapped.documentLevel).toEqual(['Tax percent must be 0–100.', 'Too many lines.']);
  });

  it('maps empty details to empty errors', () => {
    expect(mapPricingErrors(undefined, 2)).toEqual({ rows: new Map(), documentLevel: [] });
  });
});
