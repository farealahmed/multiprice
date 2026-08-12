import { roundHalfUp, roundRatioHalfUp } from './rounding.ts';

export type Discount =
  | { type: 'none' }
  | { type: 'percent'; value: number }
  | { type: 'fixed'; value: number };

/** Engine-boundary representation: thousandths, cents, and basis points. */
export interface LineInput {
  quantity: number;
  unitPrice: number;
  discount: Discount;
  taxPercent: number | null;
}

export interface LineResult {
  subtotal: number;
  discountAmount: number;
  afterDiscount: number;
  taxAmount: number;
  total: number;
}

export type PricingErrorCode = 'DISCOUNT_EXCEEDS_SUBTOTAL' | 'QUANTITY_TOO_LOW';

/** A domain error with no knowledge of HTTP transport or validation libraries. */
export class PricingError extends Error {
  readonly code: PricingErrorCode;

  constructor(code: PricingErrorCode, message: string) {
    super(message);
    this.name = 'PricingError';
    this.code = code;
  }
}

function assertSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${field} must be a safe integer at the pricing boundary`);
  }
}

/** Multiplies thousandths by cents while keeping intermediate values safe. */
function calculateSubtotal(quantity: number, unitPrice: number): number {
  const wholeQuantity = Math.floor(quantity / 1_000);
  const fractionalQuantity = quantity % 1_000;

  return wholeQuantity * unitPrice + roundRatioHalfUp(fractionalQuantity * unitPrice, 1_000);
}

/** Applies an integer basis-point rate without overflowing a safe cent amount. */
function calculatePercentage(amount: number, basisPoints: number): number {
  const wholeAmount = Math.floor(amount / 10_000);
  const remainder = amount % 10_000;

  return wholeAmount * basisPoints + roundRatioHalfUp(remainder * basisPoints, 10_000);
}

export function calculateLine(input: LineInput): LineResult {
  assertSafeInteger(input.quantity, 'Quantity');
  assertSafeInteger(input.unitPrice, 'Unit price');
  if (input.quantity < 1_000) {
    throw new PricingError('QUANTITY_TOO_LOW', 'Quantity must be at least 1');
  }

  const subtotal = roundHalfUp(calculateSubtotal(input.quantity, input.unitPrice));
  const discountAmount =
    input.discount.type === 'none'
      ? 0
      : input.discount.type === 'percent'
        ? roundHalfUp(calculatePercentage(subtotal, input.discount.value))
        : input.discount.value;

  if (discountAmount > subtotal) {
    throw new PricingError('DISCOUNT_EXCEEDS_SUBTOTAL', 'Fixed discount exceeds line subtotal');
  }

  const afterDiscount = roundHalfUp(subtotal - discountAmount);
  const taxAmount = input.taxPercent == null ? 0 : roundHalfUp(calculatePercentage(afterDiscount, input.taxPercent));

  return {
    subtotal,
    discountAmount,
    afterDiscount,
    taxAmount,
    total: afterDiscount + taxAmount,
  };
}
