import { describe, it, expect } from 'vitest';

import {
  dateRangeQuerySchema,
  reportSummarySchema,
  REPORT_ERROR_CODES,
  DATE_RANGE_INVALID,
  DATE_RANGE_INVERTED,
} from './report.ts';

function domainCode(
  result: {
    success: false;
    error: {
      issues: Array<{
        code: string;
        params?: Record<string, unknown>;
        path: (string | number)[];
      }>;
    };
  },
  path?: (string | number)[],
): string | undefined {
  const issue = result.error.issues.find((i) => {
    if (i.code !== 'custom') return false;
    if (path === undefined) return true;
    return JSON.stringify(i.path) === JSON.stringify(path);
  });
  return issue?.params?.code as string | undefined;
}

describe('report schemas — dateRangeQuerySchema acceptance', () => {
  it('accepts a full range where from <= to', () => {
    const result = dateRangeQuerySchema.safeParse({ from: '2026-07-01', to: '2026-07-31' });
    expect(result.success).toBe(true);
  });

  it('accepts from === to', () => {
    const result = dateRangeQuerySchema.safeParse({ from: '2026-07-15', to: '2026-07-15' });
    expect(result.success).toBe(true);
  });

  it('accepts an empty query', () => {
    const result = dateRangeQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.from).toBeUndefined();
      expect(result.data.to).toBeUndefined();
    }
  });

  it('accepts only from', () => {
    const result = dateRangeQuerySchema.safeParse({ from: '2026-07-01' });
    expect(result.success).toBe(true);
  });

  it('accepts only to', () => {
    const result = dateRangeQuerySchema.safeParse({ to: '2026-07-31' });
    expect(result.success).toBe(true);
  });
});

describe('report schemas — DATE_RANGE_INVALID', () => {
  it('rejects a malformed from', () => {
    const result = dateRangeQuerySchema.safeParse({ from: '07/01/2026' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(domainCode(result, ['from'])).toBe(DATE_RANGE_INVALID);
    }
  });

  it('rejects a malformed to', () => {
    const result = dateRangeQuerySchema.safeParse({ to: '07/31/2026' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(domainCode(result, ['to'])).toBe(DATE_RANGE_INVALID);
    }
  });
});

describe('report schemas — DATE_RANGE_INVERTED', () => {
  it('rejects from > to with path ["to"]', () => {
    const result = dateRangeQuerySchema.safeParse({ from: '2026-08-01', to: '2026-07-01' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(domainCode(result, ['to'])).toBe(DATE_RANGE_INVERTED);
    }
  });
});

describe('report schemas — error code completeness', () => {
  it('lists every ReportErrorCode in the code array', () => {
    const expected = [DATE_RANGE_INVALID, DATE_RANGE_INVERTED];
    expect(REPORT_ERROR_CODES.length).toBe(expected.length);
    for (const code of expected) {
      expect(REPORT_ERROR_CODES).toContain(code);
    }
  });
});

describe('report schemas — ReportSummary shape', () => {
  it('has exactly the expected fields', () => {
    const keys = Object.keys(reportSummarySchema.shape);
    expect(keys).toEqual([
      'from',
      'to',
      'documentCount',
      'totalGrandTotal',
      'totalTax',
      'totalDiscount',
    ]);
  });
});
