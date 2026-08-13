import type { ObjectId } from 'mongodb';

/**
 * Persisted document record.
 *
 * Domain type discipline: this file imports nothing but driver types, mirroring
 * `src/domain/user.ts`.
 *
 * Money is stored as integer cents, quantity as integer thousandths, and
 * percentages as basis points — the same scale the pricing engine computes in.
 */

export interface StoredDocument {
  _id: ObjectId;
  ownerId: string;
  title: string;
  customer: string;
  issueDate: string;
  status: 'draft' | 'finalized';
  lines: StoredLineItem[];
  totals: StoredTotals;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredLineItem {
  id: string;
  description: string;
  /** Integer thousandths (e.g. `2.5` → `2500`). */
  quantity: number;
  /** Integer cents. */
  unitPrice: number;
  discount: StoredDiscount;
  /** Integer basis points, or `null`. */
  taxPercent: number | null;
}

export type StoredDiscount =
  | { type: 'none' }
  | { type: 'percent'; value: number }
  | { type: 'fixed'; value: number };

export interface StoredTotals {
  /** All values in integer cents. */
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
}
