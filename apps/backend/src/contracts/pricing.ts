import { z } from 'zod';

/**
 * Pricing contract — schemas and error codes for `POST /api/v1/pricing/preview`.
 *
 * Business-rule rejections (bounds, precision, ranges) ride through zod's
 * `superRefine`/`ctx.addIssue({ code: 'custom', params: { code } })` so the
 * amended `envelope-mapper.ts` can surface a SCREAMING_SNAKE domain code
 * instead of zod's generic issue code (ARCH Decision A5).
 */

export const QUANTITY_TOO_LOW = 'QUANTITY_TOO_LOW' as const;
export const QUANTITY_TOO_LARGE = 'QUANTITY_TOO_LARGE' as const;
export const QUANTITY_PRECISION = 'QUANTITY_PRECISION' as const;
export const UNIT_PRICE_NEGATIVE = 'UNIT_PRICE_NEGATIVE' as const;
export const UNIT_PRICE_TOO_LARGE = 'UNIT_PRICE_TOO_LARGE' as const;
export const MONEY_PRECISION = 'MONEY_PRECISION' as const;
export const TAX_PERCENT_OUT_OF_RANGE = 'TAX_PERCENT_OUT_OF_RANGE' as const;
export const DISCOUNT_PERCENT_OUT_OF_RANGE = 'DISCOUNT_PERCENT_OUT_OF_RANGE' as const;
export const FIXED_DISCOUNT_NEGATIVE = 'FIXED_DISCOUNT_NEGATIVE' as const;
/** Reserved: not reachable through `lineInputSchema` — the discriminated union
 * already makes "both discount types at once" unrepresentable on the wire. */
export const DISCOUNT_TYPE_CONFLICT = 'DISCOUNT_TYPE_CONFLICT' as const;
/** Raised by the engine (T2), not this schema — subtotal isn't known until calculation. */
export const DISCOUNT_EXCEEDS_SUBTOTAL = 'DISCOUNT_EXCEEDS_SUBTOTAL' as const;

export type PricingErrorCode =
  | typeof QUANTITY_TOO_LOW
  | typeof QUANTITY_TOO_LARGE
  | typeof QUANTITY_PRECISION
  | typeof UNIT_PRICE_NEGATIVE
  | typeof UNIT_PRICE_TOO_LARGE
  | typeof MONEY_PRECISION
  | typeof TAX_PERCENT_OUT_OF_RANGE
  | typeof DISCOUNT_PERCENT_OUT_OF_RANGE
  | typeof FIXED_DISCOUNT_NEGATIVE
  | typeof DISCOUNT_TYPE_CONFLICT
  | typeof DISCOUNT_EXCEEDS_SUBTOTAL;

const MAX_QUANTITY = 1_000_000;
const MAX_UNIT_PRICE = 1_000_000;
const MAX_LINES = 500;

/** Decimal places in a finite number's shortest round-trip string form. */
function decimalPlaces(n: number): number {
  const s = n.toString();
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

const discountSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('percent'), value: z.number() }),
  z.object({ type: z.literal('fixed'), value: z.number() }),
]);

export const lineInputSchema = z
  .object({
    quantity: z.number(),
    unitPrice: z.number(),
    discount: discountSchema,
    taxPercent: z.number().nullable().optional(),
  })
  .superRefine((line, ctx) => {
    if (line.quantity < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantity'],
        params: { code: QUANTITY_TOO_LOW },
        message: 'Quantity must be at least 1',
      });
    } else if (line.quantity > MAX_QUANTITY) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantity'],
        params: { code: QUANTITY_TOO_LARGE },
        message: `Quantity must not exceed ${MAX_QUANTITY}`,
      });
    } else if (decimalPlaces(line.quantity) > 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantity'],
        params: { code: QUANTITY_PRECISION },
        message: 'Quantity must have at most 3 decimal places',
      });
    }

    if (line.unitPrice < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['unitPrice'],
        params: { code: UNIT_PRICE_NEGATIVE },
        message: 'Unit price must not be negative',
      });
    } else if (line.unitPrice > MAX_UNIT_PRICE) {
      ctx.addIssue({
        code: 'custom',
        path: ['unitPrice'],
        params: { code: UNIT_PRICE_TOO_LARGE },
        message: `Unit price must not exceed ${MAX_UNIT_PRICE}`,
      });
    } else if (decimalPlaces(line.unitPrice) > 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['unitPrice'],
        params: { code: MONEY_PRECISION },
        message: 'Unit price must have at most 2 decimal places',
      });
    }

    if (line.discount.type === 'percent' && (line.discount.value < 0 || line.discount.value > 100)) {
      ctx.addIssue({
        code: 'custom',
        path: ['discount', 'value'],
        params: { code: DISCOUNT_PERCENT_OUT_OF_RANGE },
        message: 'Discount percent must be between 0 and 100',
      });
    }

    if (line.discount.type === 'fixed' && line.discount.value < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['discount', 'value'],
        params: { code: FIXED_DISCOUNT_NEGATIVE },
        message: 'Fixed discount must not be negative',
      });
    }

    if (line.taxPercent != null && (line.taxPercent < 0 || line.taxPercent > 100)) {
      ctx.addIssue({
        code: 'custom',
        path: ['taxPercent'],
        params: { code: TAX_PERCENT_OUT_OF_RANGE },
        message: 'Tax percent must be between 0 and 100',
      });
    }
  });

export type LineInput = z.infer<typeof lineInputSchema>;

export const previewRequestSchema = z.object({
  lines: z.array(lineInputSchema).max(MAX_LINES),
});

export type PreviewRequest = z.infer<typeof previewRequestSchema>;

const lineResultSchema = z.object({
  subtotal: z.number(),
  discountAmount: z.number(),
  afterDiscount: z.number(),
  taxAmount: z.number(),
  total: z.number(),
});

export type LineResult = z.infer<typeof lineResultSchema>;

export const documentResultSchema = z.object({
  lines: z.array(lineResultSchema),
  subtotal: z.number(),
  totalDiscount: z.number(),
  totalTax: z.number(),
  grandTotal: z.number(),
});

export type DocumentResult = z.infer<typeof documentResultSchema>;
