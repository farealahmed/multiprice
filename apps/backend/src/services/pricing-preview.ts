import {
  calculateDocument,
  calculateLine,
  PricingError,
  type DocumentResult as EngineDocumentResult,
  type LineInput as EngineLineInput,
} from '../pricing/index.ts';
import {
  fromCents,
  toBasisPoints,
  toCents,
  toThousandths,
} from '../pricing/units.ts';
import type { DocumentResult, LineInput } from '../contracts/pricing.ts';

/** Carries an engine failure and its request-line context to the HTTP boundary. */
export class PricingPreviewError extends Error {
  readonly cause: PricingError;
  readonly lineIndex: number | null;

  constructor(cause: PricingError, lineIndex: number | null) {
    super(cause.message);
    this.name = 'PricingPreviewError';
    this.cause = cause;
    this.lineIndex = lineIndex;
  }
}

export function toEngineLine(line: LineInput): EngineLineInput {
  return {
    quantity: toThousandths(line.quantity),
    unitPrice: toCents(line.unitPrice),
    discount:
      line.discount.type === 'none'
        ? line.discount
        : line.discount.type === 'percent'
          ? { type: 'percent', value: toBasisPoints(line.discount.value) }
          : { type: 'fixed', value: toCents(line.discount.value) },
    taxPercent: line.taxPercent == null ? null : toBasisPoints(line.taxPercent),
  };
}

export function fromEngineResult(result: EngineDocumentResult): DocumentResult {
  return {
    lines: result.lines.map((line) => ({
      subtotal: fromCents(line.subtotal),
      discountAmount: fromCents(line.discountAmount),
      afterDiscount: fromCents(line.afterDiscount),
      taxAmount: fromCents(line.taxAmount),
      total: fromCents(line.total),
    })),
    subtotal: fromCents(result.subtotal),
    totalDiscount: fromCents(result.totalDiscount),
    totalTax: fromCents(result.totalTax),
    grandTotal: fromCents(result.grandTotal),
  };
}

export function findFailingLine(lines: readonly EngineLineInput[], code: PricingError['code']): number | null {
  for (const [index, line] of lines.entries()) {
    try {
      calculateLine(line);
    } catch (error) {
      if (error instanceof PricingError && error.code === code) {
        return index;
      }
      throw error;
    }
  }

  return null;
}

/** Converts the wire representation, delegates calculation, then converts the result back. */
export function previewPricing(lines: readonly LineInput[]): DocumentResult {
  const engineLines = lines.map(toEngineLine);

  try {
    return fromEngineResult(calculateDocument(engineLines));
  } catch (error) {
    if (error instanceof PricingError) {
      throw new PricingPreviewError(error, findFailingLine(engineLines, error.code));
    }
    throw error;
  }
}
