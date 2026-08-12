// Hand-written mirror of apps/backend/src/contracts/pricing.ts — keep in sync by hand.
// Rule 1 of the phase plan: duplication is deliberate; do not introduce code generation.

export type Discount =
  | { type: 'none' }
  | { type: 'percent'; value: number }
  | { type: 'fixed'; value: number };

export type LineInput = {
  quantity: number;
  unitPrice: number;
  discount: Discount;
  taxPercent: number | null;
};

export type LineResult = {
  subtotal: number;
  discountAmount: number;
  afterDiscount: number;
  taxAmount: number;
  total: number;
};

export type DocumentResult = {
  lines: LineResult[];
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
};

export const QUANTITY_TOO_LOW = 'QUANTITY_TOO_LOW';
export const QUANTITY_TOO_LARGE = 'QUANTITY_TOO_LARGE';
export const QUANTITY_PRECISION = 'QUANTITY_PRECISION';
export const UNIT_PRICE_NEGATIVE = 'UNIT_PRICE_NEGATIVE';
export const UNIT_PRICE_TOO_LARGE = 'UNIT_PRICE_TOO_LARGE';
export const MONEY_PRECISION = 'MONEY_PRECISION';
export const TAX_PERCENT_OUT_OF_RANGE = 'TAX_PERCENT_OUT_OF_RANGE';
export const DISCOUNT_PERCENT_OUT_OF_RANGE = 'DISCOUNT_PERCENT_OUT_OF_RANGE';
export const DISCOUNT_TYPE_CONFLICT = 'DISCOUNT_TYPE_CONFLICT';
export const DISCOUNT_EXCEEDS_SUBTOTAL = 'DISCOUNT_EXCEEDS_SUBTOTAL';

export type PricingErrorCode =
  | typeof QUANTITY_TOO_LOW
  | typeof QUANTITY_TOO_LARGE
  | typeof QUANTITY_PRECISION
  | typeof UNIT_PRICE_NEGATIVE
  | typeof UNIT_PRICE_TOO_LARGE
  | typeof MONEY_PRECISION
  | typeof TAX_PERCENT_OUT_OF_RANGE
  | typeof DISCOUNT_PERCENT_OUT_OF_RANGE
  | typeof DISCOUNT_TYPE_CONFLICT
  | typeof DISCOUNT_EXCEEDS_SUBTOTAL;
