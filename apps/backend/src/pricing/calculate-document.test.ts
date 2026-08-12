import { describe, expect, it } from 'vitest';

import { pdfSampleExpected, pdfSampleLines } from '../../test/fixtures/pdf-sample.ts';
import { calculateDocument } from './calculate-document.ts';
import type { LineInput } from './calculate-line.ts';
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

describe('calculateDocument', () => {
  it('calculates the PDF sample from already-converted inputs', () => {
    expect(calculateDocument(pdfSampleLines.map(toEngineInput))).toMatchObject({
      subtotal: toCents(pdfSampleExpected.subtotal),
      totalDiscount: toCents(pdfSampleExpected.totalDiscount),
      totalTax: toCents(pdfSampleExpected.totalTax),
      grandTotal: toCents(pdfSampleExpected.grandTotal),
    });
  });

  it('maintains the document grand-total identity', () => {
    const result = calculateDocument(pdfSampleLines.map(toEngineInput));

    expect(result.grandTotal).toBe(result.subtotal - result.totalDiscount + result.totalTax);
  });

  it('is stable across repeated calls', () => {
    const lines = pdfSampleLines.map(toEngineInput);

    expect(calculateDocument(lines)).toEqual(calculateDocument(lines));
  });
});
