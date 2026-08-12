import { describe, expect, it } from 'vitest';

import {
  fromBasisPoints,
  fromCents,
  fromThousandths,
  toBasisPoints,
  toCents,
  toThousandths,
} from './units.ts';

describe('pricing units', () => {
  it('round-trips supported major-unit values exactly', () => {
    expect(fromCents(toCents(10.01))).toBe(10.01);
    expect(fromThousandths(toThousandths(1.234))).toBe(1.234);
    expect(fromBasisPoints(toBasisPoints(12.34))).toBe(12.34);
  });

  it('rejects precision that would otherwise be truncated', () => {
    expect(() => toCents(10.001)).toThrow(RangeError);
    expect(() => toThousandths(1.2345)).toThrow(RangeError);
    expect(() => toBasisPoints(12.345)).toThrow(RangeError);
  });
});
