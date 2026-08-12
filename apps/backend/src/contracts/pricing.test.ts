import { describe, it, expect } from 'vitest';
import { pdfSampleLines } from '../../test/fixtures/pdf-sample.ts';
import {
  lineInputSchema,
  previewRequestSchema,
  QUANTITY_TOO_LOW,
  QUANTITY_TOO_LARGE,
  QUANTITY_PRECISION,
  UNIT_PRICE_NEGATIVE,
  UNIT_PRICE_TOO_LARGE,
  MONEY_PRECISION,
  DISCOUNT_PERCENT_OUT_OF_RANGE,
  FIXED_DISCOUNT_NEGATIVE,
  TAX_PERCENT_OUT_OF_RANGE,
} from './pricing.ts';

/** First custom-issue's domain code, or undefined if none was raised. */
function domainCode(result: ReturnType<typeof lineInputSchema.safeParse>): string | undefined {
  if (result.success) return undefined;
  const issue = result.error.issues.find((i) => i.code === 'custom');
  return issue && 'params' in issue ? (issue.params as { code?: string } | undefined)?.code : undefined;
}

describe('lineInputSchema — acceptance', () => {
  it('accepts a valid LineInput at each boundary', () => {
    const base = { discount: { type: 'none' as const } };
    const cases = [
      { ...base, quantity: 1, unitPrice: 0, taxPercent: 0 },
      { ...base, quantity: 1_000_000, unitPrice: 1_000_000, taxPercent: 100 },
      { ...base, quantity: 1, unitPrice: 0, taxPercent: null },
    ];
    for (const c of cases) {
      expect(lineInputSchema.safeParse(c).success).toBe(true);
    }
  });

  it('accepts each discount shape and narrows the union', () => {
    const shapes = [
      { type: 'none' as const },
      { type: 'percent' as const, value: 10 },
      { type: 'fixed' as const, value: 20 },
    ];
    for (const discount of shapes) {
      const result = lineInputSchema.safeParse({ quantity: 1, unitPrice: 10, discount, taxPercent: null });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.discount.type).toBe(discount.type);
      }
    }
  });
});

describe('lineInputSchema — quantity and price rejection', () => {
  const valid = { unitPrice: 10, discount: { type: 'none' as const }, taxPercent: null };

  it('rejects quantity below the minimum', () => {
    for (const quantity of [0, 0.999]) {
      const result = lineInputSchema.safeParse({ ...valid, quantity });
      expect(result.success).toBe(false);
      expect(domainCode(result)).toBe(QUANTITY_TOO_LOW);
    }
  });

  it('rejects quantity above the cap', () => {
    const result = lineInputSchema.safeParse({ ...valid, quantity: 1_000_001 });
    expect(result.success).toBe(false);
    expect(domainCode(result)).toBe(QUANTITY_TOO_LARGE);
  });

  it('rejects over-precision quantity', () => {
    const result = lineInputSchema.safeParse({ ...valid, quantity: 1.2345 });
    expect(result.success).toBe(false);
    expect(domainCode(result)).toBe(QUANTITY_PRECISION);
  });

  it('rejects negative unit price', () => {
    const result = lineInputSchema.safeParse({ ...valid, quantity: 1, unitPrice: -1 });
    expect(result.success).toBe(false);
    expect(domainCode(result)).toBe(UNIT_PRICE_NEGATIVE);
  });

  it('rejects unit price above the cap', () => {
    const result = lineInputSchema.safeParse({ ...valid, quantity: 1, unitPrice: 1_000_000.01 });
    expect(result.success).toBe(false);
    expect(domainCode(result)).toBe(UNIT_PRICE_TOO_LARGE);
  });

  it('rejects over-precision unit price', () => {
    const result = lineInputSchema.safeParse({ ...valid, quantity: 1, unitPrice: 1.005 });
    expect(result.success).toBe(false);
    expect(domainCode(result)).toBe(MONEY_PRECISION);
  });
});

describe('lineInputSchema — discount and tax rejection', () => {
  const valid = { quantity: 1, unitPrice: 10, taxPercent: null };

  it('rejects out-of-range percent discount', () => {
    for (const value of [101, -1]) {
      const result = lineInputSchema.safeParse({ ...valid, discount: { type: 'percent', value } });
      expect(result.success).toBe(false);
      expect(domainCode(result)).toBe(DISCOUNT_PERCENT_OUT_OF_RANGE);
    }
  });

  it('rejects a negative fixed discount', () => {
    const result = lineInputSchema.safeParse({ ...valid, discount: { type: 'fixed', value: -0.01 } });
    expect(result.success).toBe(false);
    expect(domainCode(result)).toBe(FIXED_DISCOUNT_NEGATIVE);
  });

  it('rejects out-of-range tax', () => {
    for (const taxPercent of [101, -1]) {
      const result = lineInputSchema.safeParse({ ...valid, discount: { type: 'none' }, taxPercent });
      expect(result.success).toBe(false);
      expect(domainCode(result)).toBe(TAX_PERCENT_OUT_OF_RANGE);
    }
  });

  it('documents DISCOUNT_TYPE_CONFLICT as reserved — unreachable through this schema', () => {
    const result = lineInputSchema.safeParse({
      ...valid,
      discount: { type: 'both', percentValue: 10, fixedValue: 5 },
    });
    expect(result.success).toBe(false);
    // Generic shape error (invalid discriminated-union member), never a custom domain code.
    expect(result.success ? undefined : result.error.issues.every((i) => i.code !== 'custom')).toBe(true);
  });
});

describe('previewRequestSchema — array bound', () => {
  const oneLine = { quantity: 1, unitPrice: 1, discount: { type: 'none' as const }, taxPercent: null };

  it('accepts exactly 500 lines', () => {
    const result = previewRequestSchema.safeParse({ lines: Array(500).fill(oneLine) });
    expect(result.success).toBe(true);
  });

  it('rejects a request over 500 lines', () => {
    const result = previewRequestSchema.safeParse({ lines: Array(501).fill(oneLine) });
    expect(result.success).toBe(false);
  });
});

describe('previewRequestSchema — PDF sample fixture', () => {
  it('accepts the PDF sample as a valid request', () => {
    const result = previewRequestSchema.safeParse({ lines: pdfSampleLines });
    expect(result.success).toBe(true);
  });
});
