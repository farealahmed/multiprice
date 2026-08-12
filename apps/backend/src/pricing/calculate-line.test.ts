import { describe, expect, it } from 'vitest';

import { pdfSampleExpected, pdfSampleLines } from '../../test/fixtures/pdf-sample.ts';
import { calculateLine, type LineInput, type PricingError } from './calculate-line.ts';
import { toBasisPoints, toCents, toThousandths } from './units.ts';

function toEngineInput(line: (typeof pdfSampleLines)[number]): LineInput {
  return {
    quantity: toThousandths(line.quantity),
    unitPrice: toCents(line.unitPrice),
    discount:
      line.discount.type === 'none'
        ? line.discount
        : line.discount.type === 'percent'
          ? { type: 'percent', value: toBasisPoints(line.discount.value) }
          : { type: 'fixed', value: toCents(line.discount.value) },
    taxPercent: line.taxPercent == null ? null : toBasisPoints(line.taxPercent),
  };
}

describe('calculateLine', () => {
  it('calculates each PDF sample line in cents', () => {
    const results = pdfSampleLines.map(toEngineInput).map(calculateLine);

    expect(results).toEqual(
      pdfSampleExpected.lines.map((line) => ({
        subtotal: toCents(line.subtotal),
        discountAmount: toCents(line.discountAmount),
        afterDiscount: toCents(line.afterDiscount),
        taxAmount: toCents(line.taxAmount),
        total: toCents(line.total),
      })),
    );
  });

  it('rounds a half-cent tax away from zero', () => {
    expect(
      calculateLine({
        quantity: toThousandths(1),
        unitPrice: toCents(1.8),
        discount: { type: 'none' },
        taxPercent: toBasisPoints(2.5),
      }),
    ).toMatchObject({ afterDiscount: 180, taxAmount: 5, total: 185 });
  });

  it('handles zero-value discounts and tax consistently', () => {
    const base = {
      quantity: toThousandths(1),
      unitPrice: toCents(20),
    };

    expect(calculateLine({ ...base, discount: { type: 'percent', value: toBasisPoints(100) }, taxPercent: toBasisPoints(5) }))
      .toMatchObject({ afterDiscount: 0, taxAmount: 0, total: 0 });
    expect(calculateLine({ ...base, discount: { type: 'fixed', value: toCents(20) }, taxPercent: null }))
      .toMatchObject({ afterDiscount: 0, taxAmount: 0, total: 0 });
    expect(calculateLine({ ...base, discount: { type: 'none' }, taxPercent: null }))
      .toEqual(calculateLine({ ...base, discount: { type: 'none' }, taxPercent: toBasisPoints(0) }));
  });

  it('rejects a fixed discount that exceeds the rounded subtotal', () => {
    expect(() =>
      calculateLine({
        quantity: toThousandths(1),
        unitPrice: toCents(20),
        discount: { type: 'fixed', value: toCents(20.01) },
        taxPercent: null,
      }),
    ).toThrow(expect.objectContaining({ code: 'DISCOUNT_EXCEEDS_SUBTOTAL' } satisfies Partial<PricingError>));
  });

  it('enforces the quantity lower bound while accepting decimal quantities', () => {
    const withQuantity = (quantity: number) => ({
      quantity,
      unitPrice: toCents(1),
      discount: { type: 'none' } as const,
      taxPercent: null,
    });

    for (const quantity of [toThousandths(0), toThousandths(0.999)]) {
      expect(() => calculateLine(withQuantity(quantity))).toThrow(
        expect.objectContaining({ code: 'QUANTITY_TOO_LOW' } satisfies Partial<PricingError>),
      );
    }
    for (const quantity of [toThousandths(1), toThousandths(1.5), toThousandths(2.5)]) {
      expect(calculateLine(withQuantity(quantity))).toBeDefined();
    }
  });

  it('rounds the subtotal before computing a discount and keeps cents exact', () => {
    expect(
      calculateLine({
        quantity: toThousandths(2.5),
        unitPrice: toCents(10.01),
        discount: { type: 'percent', value: toBasisPoints(10) },
        taxPercent: null,
      }),
    ).toMatchObject({ subtotal: 2503, discountAmount: 250, afterDiscount: 2253, total: 2253 });

    expect(
      calculateLine({
        quantity: toThousandths(3),
        unitPrice: toCents(0.1),
        discount: { type: 'none' },
        taxPercent: null,
      }),
    ).toMatchObject({ subtotal: 30, total: 30 });
  });

  it('accepts boundary inputs', () => {
    const base = {
      quantity: toThousandths(1),
      unitPrice: toCents(0),
      discount: { type: 'none' } as const,
    };

    expect(calculateLine({ ...base, taxPercent: toBasisPoints(0) })).toMatchObject({ total: 0 });
    expect(calculateLine({ ...base, taxPercent: toBasisPoints(100) })).toMatchObject({ total: 0 });
    expect(
      calculateLine({
        quantity: toThousandths(1_000_000),
        unitPrice: toCents(1_000_000),
        discount: { type: 'none' },
        taxPercent: null,
      }),
    ).toMatchObject({ subtotal: 100_000_000_000_000, total: 100_000_000_000_000 });
  });
});
