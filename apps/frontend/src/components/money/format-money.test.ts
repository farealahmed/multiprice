import { describe, expect, it } from 'vitest';

import { formatMoney } from './format-money';

describe('formatMoney', () => {
  it('always renders two decimal places', () => {
    expect(formatMoney(421.5)).toBe('421.50');
    expect(formatMoney(189)).toBe('189.00');
    expect(formatMoney(0)).toBe('0.00');
  });

  it('does not add grouping separators', () => {
    expect(formatMoney(1234.5)).toBe('1234.50');
  });
});
