import type { LineInput } from '../../src/contracts/pricing.ts';

/**
 * The PDF brief's 3-line sample, as executable data (ARCH G1 step 8).
 * Numbers below are the brief's own worked example — used to pin
 * `calculateLine`/`calculateDocument` (T2) and the HTTP round trip (T3).
 */
export const pdfSampleLines: LineInput[] = [
  {
    // Widget A — 10% discount, 5% tax
    quantity: 2,
    unitPrice: 100.0,
    discount: { type: 'percent', value: 10 },
    taxPercent: 5,
  },
  {
    // Widget B — no discount, 5% tax
    quantity: 1,
    unitPrice: 50.0,
    discount: { type: 'none' },
    taxPercent: 5,
  },
  {
    // Service fee — $20 fixed discount, no tax
    quantity: 1,
    unitPrice: 200.0,
    discount: { type: 'fixed', value: 20.0 },
    taxPercent: null,
  },
];

/** Expected per-line and document totals, in major units, per the PDF's worked example. */
export const pdfSampleExpected = {
  lines: [
    { subtotal: 200.0, discountAmount: 20.0, afterDiscount: 180.0, taxAmount: 9.0, total: 189.0 },
    { subtotal: 50.0, discountAmount: 0.0, afterDiscount: 50.0, taxAmount: 2.5, total: 52.5 },
    { subtotal: 200.0, discountAmount: 20.0, afterDiscount: 180.0, taxAmount: 0.0, total: 180.0 },
  ],
  subtotal: 450.0,
  totalDiscount: 40.0,
  totalTax: 11.5,
  grandTotal: 421.5,
};
