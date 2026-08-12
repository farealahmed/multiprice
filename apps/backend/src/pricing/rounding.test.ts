import { describe, expect, it } from 'vitest';

import { roundHalfUp } from './rounding.ts';

describe('roundHalfUp', () => {
  it('rounds exact halves away from zero', () => {
    // 180 cents at 2.5% tax is 4.5 cents, so the policy yields 5 cents.
    expect(roundHalfUp(4.5)).toBe(5);
    expect(roundHalfUp(-4.5)).toBe(-5);
  });
});
