import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../src/app.ts';
import { documentResultSchema, type LineInput } from '../../src/contracts/pricing.ts';
import { calculateDocument, type LineInput as EngineLineInput } from '../../src/pricing/index.ts';
import { fromCents, toBasisPoints, toCents, toThousandths } from '../../src/pricing/units.ts';
import { pdfSampleExpected, pdfSampleLines } from '../fixtures/pdf-sample.ts';

let app: FastifyInstance;

function toEngineInput(line: LineInput): EngineLineInput {
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

function fromEngineDocument(lines: LineInput[]) {
  const result = calculateDocument(lines.map(toEngineInput));

  return {
    lines: result.lines.map((line) => ({
      subtotal: fromCents(line.subtotal),
      discountAmount: fromCents(line.discountAmount),
      afterDiscount: fromCents(line.afterDiscount),
      taxAmount: fromCents(line.taxAmount),
      total: fromCents(line.total),
    })),
    subtotal: fromCents(result.subtotal),
    totalDiscount: fromCents(result.totalDiscount),
    totalTax: fromCents(result.totalTax),
    grandTotal: fromCents(result.grandTotal),
  };
}

beforeEach(async () => {
  app = await buildApp({ logger: false });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('POST /api/v1/pricing/preview', () => {
  it('returns the PDF sample totals in major units', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/pricing/preview',
      payload: { lines: pdfSampleLines },
    });

    expect(response.statusCode).toBe(200);
    const body = documentResultSchema.parse(response.json());
    expect(body).toEqual({ ...pdfSampleExpected, lines: pdfSampleExpected.lines });
  });

  it('matches the direct engine result after boundary conversion', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/pricing/preview',
      payload: { lines: pdfSampleLines },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(fromEngineDocument(pdfSampleLines));
  });

  it.each([
    ['quantity too low', { quantity: 0 }, 'QUANTITY_TOO_LOW', 'lines.0.quantity'],
    ['quantity too large', { quantity: 1_000_001 }, 'QUANTITY_TOO_LARGE', 'lines.0.quantity'],
    ['quantity precision', { quantity: 1.0001 }, 'QUANTITY_PRECISION', 'lines.0.quantity'],
    ['negative unit price', { unitPrice: -0.01 }, 'UNIT_PRICE_NEGATIVE', 'lines.0.unitPrice'],
    ['unit price too large', { unitPrice: 1_000_000.01 }, 'UNIT_PRICE_TOO_LARGE', 'lines.0.unitPrice'],
    ['money precision', { unitPrice: 1.001 }, 'MONEY_PRECISION', 'lines.0.unitPrice'],
    ['tax percentage', { taxPercent: 100.01 }, 'TAX_PERCENT_OUT_OF_RANGE', 'lines.0.taxPercent'],
    ['discount percentage', { discount: { type: 'percent', value: 100.01 } }, 'DISCOUNT_PERCENT_OUT_OF_RANGE', 'lines.0.discount.value'],
  ])('rejects %s with a code and field path', async (_caseName, patch, code, path) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/pricing/preview',
      payload: {
        lines: [
          {
            quantity: 1,
            unitPrice: 1,
            discount: { type: 'none' },
            taxPercent: null,
            ...patch,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'VALIDATION_FAILED',
          details: expect.arrayContaining([expect.objectContaining({ code, path })]),
        }),
      }),
    );
  });

  it('maps a fixed discount over the subtotal to its domain error and field path', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/pricing/preview',
      payload: {
        lines: [
          {
            quantity: 1,
            unitPrice: 20,
            discount: { type: 'fixed', value: 20.01 },
            taxPercent: null,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'DISCOUNT_EXCEEDS_SUBTOTAL',
        message: 'Fixed discount exceeds line subtotal',
        details: [
          {
            path: 'lines.0.discount.value',
            code: 'DISCOUNT_EXCEEDS_SUBTOTAL',
            message: 'Fixed discount exceeds line subtotal',
          },
        ],
      },
    });
  });
});
