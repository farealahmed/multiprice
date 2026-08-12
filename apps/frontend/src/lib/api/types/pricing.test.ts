import { describe, expect, it } from 'vitest';

import {
  DISCOUNT_EXCEEDS_SUBTOTAL,
  FIXED_DISCOUNT_NEGATIVE,
  isPricingErrorCode,
  QUANTITY_TOO_LOW,
} from './pricing';

describe('isPricingErrorCode', () => {
  it('recognizes every mirrored domain code', () => {
    expect(isPricingErrorCode(QUANTITY_TOO_LOW)).toBe(true);
    expect(isPricingErrorCode(FIXED_DISCOUNT_NEGATIVE)).toBe(true);
    expect(isPricingErrorCode(DISCOUNT_EXCEEDS_SUBTOTAL)).toBe(true);
  });

  it('rejects envelope-level and unrecognized codes', () => {
    expect(isPricingErrorCode('INTERNAL_ERROR')).toBe(false);
    expect(isPricingErrorCode('VALIDATION_FAILED')).toBe(false);
    expect(isPricingErrorCode('SOME_FUTURE_CODE')).toBe(false);
  });
});
