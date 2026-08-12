import { calculateLine } from './calculate-line.ts';
import type { LineInput, LineResult } from './calculate-line.ts';

export interface DocumentResult {
  lines: LineResult[];
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
}

export function calculateDocument(inputs: readonly LineInput[]): DocumentResult {
  const lines = inputs.map(calculateLine);
  let subtotal = 0;
  let totalDiscount = 0;
  let totalTax = 0;
  let grandTotal = 0;

  for (const line of lines) {
    subtotal += line.subtotal;
    totalDiscount += line.discountAmount;
    totalTax += line.taxAmount;
    grandTotal += line.total;
  }

  return { lines, subtotal, totalDiscount, totalTax, grandTotal };
}
