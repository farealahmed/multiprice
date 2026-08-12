# Phase 1 — Pricing Contract

This document freezes the wire representation for the pricing domain, added in
this phase. It is the source Phase 6's README is written from. See
`docs/contracts/phase-0.md` for the cross-cutting decisions (error envelope,
mirroring rule, conventions) this phase reuses unchanged.

## 1. Preview endpoint

`POST /api/v1/pricing/preview` — public, no auth, stateless (no DB, no session).

**Request body:**

```ts
type PreviewRequest = {
  lines: LineInput[]; // max 500
};
```

**Response (200):** `DocumentResult`, all money in major units (e.g. `189.00`, not cents).

**Response (400):** the standard `ErrorEnvelope` (Phase 0 §2) with one of this
domain's error codes and a `details[].path` pointing at the offending field,
e.g. `lines.1.taxPercent`.

## 2. `LineInput`

| Field | Type | Constraint | Rejection code |
|----|----|----|----|
| `quantity` | `number` | ≥1, ≤3dp, ≤1,000,000 | `QUANTITY_TOO_LOW` / `QUANTITY_TOO_LARGE` / `QUANTITY_PRECISION` |
| `unitPrice` | `number` | ≥0, ≤2dp, ≤1,000,000, major units | `UNIT_PRICE_NEGATIVE` / `UNIT_PRICE_TOO_LARGE` / `MONEY_PRECISION` |
| `discount` | `Discount` | see below | `DISCOUNT_PERCENT_OUT_OF_RANGE`, `FIXED_DISCOUNT_NEGATIVE`, `DISCOUNT_EXCEEDS_SUBTOTAL` |
| `taxPercent` | `number \| null` | 0–100; `null`/absent and `0` are distinct on input, identical in effect | `TAX_PERCENT_OUT_OF_RANGE` |

```ts
type Discount =
  | { type: 'none' }
  | { type: 'percent'; value: number } // 0–100
  | { type: 'fixed'; value: number };  // major-unit amount, ≤ line subtotal
```

The discriminated union makes "both a percent and a fixed discount at once"
unrepresentable on the wire — `DISCOUNT_TYPE_CONFLICT` is reserved for a future
shape that could produce it, but is not reachable through this schema today.

`DISCOUNT_EXCEEDS_SUBTOTAL` is raised by the calculation engine, not the
schema — the subtotal isn't known until the line is calculated.

There is no `id` or `description` field: this phase has no persistence, so the
response's `lines[i]` is matched back to the request's `lines[i]` positionally,
by array index.

## 3. `LineResult` / `DocumentResult`

```ts
type LineResult = {
  subtotal: number;       // qty * unitPrice, rounded
  discountAmount: number; // rounded
  afterDiscount: number;  // subtotal - discountAmount, rounded
  taxAmount: number;      // afterDiscount * taxPercent, rounded
  total: number;          // afterDiscount + taxAmount
};

type DocumentResult = {
  lines: LineResult[];    // same order and length as the request's lines[]
  subtotal: number;       // sum of lines[].subtotal
  totalDiscount: number;  // sum of lines[].discountAmount
  totalTax: number;       // sum of lines[].taxAmount
  grandTotal: number;     // subtotal - totalDiscount + totalTax
};
```

`grandTotal` always equals `subtotal - totalDiscount + totalTax` — document
totals sum already-rounded line figures, they are never recomputed from raw
inputs.

## 4. Rounding policy

Money is calculated internally as integer cents (quantity as integer
thousandths, percent as integer basis points) and converted to major units
only at the HTTP boundary. Rounding is **half-up, away from zero, to 2
decimal places**, applied at four points per line, in order:

1. subtotal (`quantity × unitPrice`)
2. discount amount
3. after-discount amount
4. tax amount

Each step rounds before the next uses it — the subtotal is rounded before the
discount is computed against it, and so on. This is why a fractional quantity
like `2.5 × 10.01` rounds its subtotal (`25.025` → `25.03`) before any
discount or tax is applied to it.

## 5. Error codes

Defined in `apps/backend/src/contracts/pricing.ts`, read by the amended
`envelope-mapper.ts` (Phase 0 §2's mapper gains an additive path: a zod issue
with `code: 'custom'` and a string `params.code` uses that as `details[].code`
instead of zod's generic issue code):

| Code | Meaning |
|----|----|
| `QUANTITY_TOO_LOW` | `quantity < 1` |
| `QUANTITY_TOO_LARGE` | `quantity > 1,000,000` |
| `QUANTITY_PRECISION` | `quantity` has more than 3 decimal places |
| `UNIT_PRICE_NEGATIVE` | `unitPrice < 0` |
| `UNIT_PRICE_TOO_LARGE` | `unitPrice > 1,000,000` |
| `MONEY_PRECISION` | `unitPrice` has more than 2 decimal places |
| `TAX_PERCENT_OUT_OF_RANGE` | `taxPercent` outside 0–100 |
| `DISCOUNT_PERCENT_OUT_OF_RANGE` | percent discount `value` outside 0–100 |
| `FIXED_DISCOUNT_NEGATIVE` | fixed discount `value < 0` |
| `DISCOUNT_TYPE_CONFLICT` | reserved — not reachable through the current schema |
| `DISCOUNT_EXCEEDS_SUBTOTAL` | fixed discount `value` exceeds the line's subtotal; raised by the engine, never clamped |

A request with more than 500 lines is rejected as a plain `VALIDATION_FAILED`
(a shape constraint, not a domain rule).

## 6. Worked sample

The PDF brief's 3-line sample (`apps/backend/test/fixtures/pdf-sample.ts`),
all money in major units:

| Line | Qty | Unit price | Discount | Tax | Subtotal | Discount amt | After discount | Tax amt | Total |
|----|----|----|----|----|----|----|----|----|----|
| Widget A | 2 | 100.00 | 10% | 5% | 200.00 | 20.00 | 180.00 | 9.00 | 189.00 |
| Widget B | 1 | 50.00 | none | 5% | 50.00 | 0.00 | 50.00 | 2.50 | 52.50 |
| Service fee | 1 | 200.00 | $20 fixed | none | 200.00 | 20.00 | 180.00 | 0.00 | 180.00 |

**Document totals:** subtotal `450.00`, totalDiscount `40.00`, totalTax
`11.50`, grandTotal `421.50`.

## 7. Mirroring

The frontend mirror lives at `apps/frontend/src/lib/api/types/pricing.ts`, per
Phase 0 §6's mirroring rule — hand-written, no code generation, kept in sync
by hand and guarded by the route's own response validation plus compile-time
type-checking against the mirror.
